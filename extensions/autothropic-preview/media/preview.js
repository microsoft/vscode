// @ts-check
/// <reference lib="dom" />

/**
 * Preview webview logic — handles toolbar controls, dropdowns, URL bar,
 * iframe management, screenshot + record buttons, and bridge messages
 * from the embedded page (scroll, page meta, bottom nav detection).
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // Globals injected by previewPanel.ts
  // @ts-ignore
  const config = typeof CONFIG !== 'undefined' ? CONFIG : {};
  // @ts-ignore
  const isRecording = typeof IS_RECORDING !== 'undefined' ? IS_RECORDING : false;

  let recording = isRecording;
  let chromeCollapsed = false;
  var scrollDebounce = null;
  var scrollCooldown = false;
  var bottomNavDetected = false;
  var lastPageBgColor = '';
  var recentWorkspaces = [];
  var indicatorIdleTimer = null;
  var currentDisplayUrl = '';
  var urlEditorInput = null;

  // ------------------------------------------------------------------
  // Chrome positioning — overlay (absolute) vs flex based on bottom nav
  // Matches original autothropic MobileSafariModernChrome.tsx architecture:
  //   hasBottomNav → flexShrink:0 (chrome takes space, solid bg)
  //   !hasBottomNav → position:absolute (chrome overlays, transparent bg)
  // ------------------------------------------------------------------

  /** Apply overlay/flex mode to bottom chrome based on bottomNavDetected.
   *  Only Safari Modern toggles — Classic Safari and Chrome are always structural. */
  function applyBottomChromeMode() {
    // Only toggle Safari Modern (id="sm-wrap") between overlay/flex
    var smWrap = document.getElementById('sm-wrap');
    if (smWrap) {
      if (bottomNavDetected) {
        // Flex mode — chrome takes space, content shrinks
        smWrap.style.position = 'static';
        smWrap.style.bottom = '';
        smWrap.style.left = '';
        smWrap.style.right = '';
        smWrap.style.flexShrink = '0';
      } else {
        // Overlay mode — chrome floats over content, transparent bg
        smWrap.style.position = 'absolute';
        smWrap.style.bottom = '0';
        smWrap.style.left = '0';
        smWrap.style.right = '0';
        smWrap.style.flexShrink = '';
      }
    }
    // Safari Classic and Chrome are always structural (flex-shrink:0) — no toggle needed

    // Update backing bg for Safari Modern
    applyPageBgToChrome();
  }

  function applyPageBgToChrome() {
    var smBacking = document.getElementById('sm-backing');
    if (smBacking) {
      if (bottomNavDetected) {
        // Flex mode: solid page-color backing (matches original)
        var chromeBg = lastPageBgColor || smBacking.getAttribute('data-chrome-bg') || '#1c1c1e';
        smBacking.style.background = chromeBg;
      } else {
        // Overlay mode: transparent (page shows through)
        smBacking.style.background = 'transparent';
      }
    }
    // Safari Modern spacer follows backing mode
    if (lastPageBgColor) {
      var smSpacer = document.getElementById('sm-spacer');
      if (smSpacer && bottomNavDetected) {
        smSpacer.style.background = lastPageBgColor;
      }
    }
    // NOTE: .safe-area-spacer on Chrome/Classic Safari keeps its toolbar bg color
    // and should NOT be overridden with page color
  }

  // ------------------------------------------------------------------
  // Home indicator pill auto-hide — matches original autothropic logic:
  // When chrome collapses (scroll down), show pill + start 5s idle timer.
  // After 5s, fade pill out. When chrome expands (scroll up), cancel timer
  // and show pill. Transition: 0.35s opacity.
  // ------------------------------------------------------------------

  function showHomePills() {
    var pills = document.querySelectorAll('.home-pill');
    for (var i = 0; i < pills.length; i++) { pills[i].style.opacity = '1'; }
  }

  function hideHomePills() {
    var pills = document.querySelectorAll('.home-pill');
    for (var i = 0; i < pills.length; i++) { pills[i].style.opacity = '0'; }
  }

  function startIndicatorIdleTimer() {
    if (indicatorIdleTimer) { clearTimeout(indicatorIdleTimer); }
    indicatorIdleTimer = setTimeout(function () {
      hideHomePills();
    }, 5000);
  }

  function cancelIndicatorIdleTimer() {
    if (indicatorIdleTimer) { clearTimeout(indicatorIdleTimer); indicatorIdleTimer = null; }
  }

  // ------------------------------------------------------------------
  // Safari Modern collapse/expand — manipulates existing DOM elements
  // ------------------------------------------------------------------

  function setCollapsed(collapsed) {
    chromeCollapsed = collapsed;

    // --- Safari Modern ---
    var wrap = document.getElementById('sm-wrap');
    var pill = document.getElementById('sm-pill');
    if (wrap && pill) {
      var barRow = document.getElementById('sm-bar-row');
      var hostname = document.getElementById('sm-hostname');
      var spacer = document.getElementById('sm-spacer');
      var iconGroups = document.querySelectorAll('.sm-icon-group');

      if (collapsed) {
        wrap.style.height = (wrap.getAttribute('data-col-h') || '59') + 'px';
        if (barRow) { barRow.style.height = (barRow.getAttribute('data-col-h') || '34') + 'px'; }
        pill.style.width = (pill.getAttribute('data-col-w') || '168px');
        pill.style.height = (pill.getAttribute('data-col-h') || '34') + 'px';
        pill.style.borderRadius = (pill.getAttribute('data-col-r') || '17') + 'px';
        if (hostname) {
          hostname.style.fontSize = '15px';
          hostname.style.color = hostname.getAttribute('data-col-color') || '';
        }
        if (spacer) { spacer.style.height = '20px'; }
        iconGroups.forEach(function (g) {
          g.style.width = '0';
          g.style.opacity = '0';
          g.style.paddingLeft = '0';
          g.style.paddingRight = '0';
        });
      } else {
        wrap.style.height = (wrap.getAttribute('data-exp-h') || '') + 'px';
        if (barRow) { barRow.style.height = (barRow.getAttribute('data-exp-h') || '52') + 'px'; }
        pill.style.width = pill.getAttribute('data-exp-w') || '';
        pill.style.height = (pill.getAttribute('data-exp-h') || '52') + 'px';
        pill.style.borderRadius = (pill.getAttribute('data-exp-r') || '26') + 'px';
        if (hostname) {
          hostname.style.fontSize = '16px';
          hostname.style.color = hostname.getAttribute('data-exp-color') || '';
        }
        if (spacer) { spacer.style.height = (spacer.getAttribute('data-exp-h') || '') + 'px'; }
        // Restore icon groups — left group has paddingLeft only, right has paddingRight only
        iconGroups.forEach(function (g, idx) {
          g.style.width = '86px';
          g.style.opacity = '1';
          if (idx === 0) {
            g.style.paddingLeft = '8px';
            g.style.paddingRight = '';
          } else {
            g.style.paddingLeft = '';
            g.style.paddingRight = '8px';
          }
        });
      }
    }

    // --- Safari Classic ---
    var scAddress = document.getElementById('sc-address');
    var scNav = document.getElementById('sc-nav');
    var scBottomWrap = document.getElementById('sc-bottom-wrap');
    if (scAddress || scNav) {
      if (collapsed) {
        if (scAddress) { scAddress.style.height = (scAddress.getAttribute('data-col-h') || '26') + 'px'; }
        if (scNav) { scNav.style.height = (scNav.getAttribute('data-col-h') || '0') + 'px'; }
        if (scBottomWrap) { scBottomWrap.style.height = (scBottomWrap.getAttribute('data-col-h') || '0') + 'px'; }
      } else {
        if (scAddress) { scAddress.style.height = (scAddress.getAttribute('data-exp-h') || '44') + 'px'; }
        if (scNav) { scNav.style.height = (scNav.getAttribute('data-exp-h') || '44') + 'px'; }
        if (scBottomWrap) { scBottomWrap.style.height = (scBottomWrap.getAttribute('data-exp-h') || '') + 'px'; }
      }
    }

    // --- Google Chrome ---
    var gcBottomWrap = document.getElementById('gc-bottom-wrap');
    if (gcBottomWrap) {
      if (collapsed) {
        gcBottomWrap.style.height = (gcBottomWrap.getAttribute('data-col-h') || '0') + 'px';
      } else {
        gcBottomWrap.style.height = (gcBottomWrap.getAttribute('data-exp-h') || '') + 'px';
      }
    }

    // --- Home indicator pill auto-hide (all chrome types) ---
    // Matches original autothropic: collapsed → show pill + 5s idle timer → fade out
    if (collapsed) {
      showHomePills();
      startIndicatorIdleTimer();
    } else {
      cancelIndicatorIdleTimer();
      showHomePills();
    }
  }

  // ------------------------------------------------------------------
  // Event delegation — all click handlers on document
  // ------------------------------------------------------------------

  function closeAllDropdowns() {
    document.querySelectorAll('.dropdown.open').forEach(function (el) {
      el.classList.remove('open');
    });
  }

  document.addEventListener('click', function (e) {
    var target = /** @type {HTMLElement} */ (e.target);

    // --- Dropdown trigger ---
    var trigger = target.closest('.dropdown-trigger');
    if (trigger) {
      e.stopPropagation();
      var dropdown = trigger.closest('.dropdown');
      if (dropdown) {
        var isOpen = dropdown.classList.contains('open');
        closeAllDropdowns();
        if (!isOpen) { dropdown.classList.add('open'); }
      }
      return;
    }

    // --- Device dropdown item ---
    var deviceItem = target.closest('#device-dropdown .dropdown-item');
    if (deviceItem) {
      var deviceId = deviceItem.getAttribute('data-device-id');
      if (deviceId) { vscode.postMessage({ type: 'selectDevice', deviceId: deviceId }); }
      closeAllDropdowns();
      return;
    }

    // --- Presets dropdown item ---
    var presetItem = target.closest('#presets-dropdown .dropdown-item');
    if (presetItem) {
      var presetId = presetItem.getAttribute('data-preset-id');
      if (presetId) { vscode.postMessage({ type: 'applyPreset', presetId: presetId }); }
      closeAllDropdowns();
      return;
    }

    // --- Small dropdown item ---
    var smallItem = target.closest('.small-dropdown .dropdown-item');
    if (smallItem) {
      var menu = smallItem.closest('.dropdown-menu');
      var action = menu ? menu.getAttribute('data-action') : null;
      var value = smallItem.getAttribute('data-value');
      if (action && value) { vscode.postMessage({ type: action, value: value }); }
      closeAllDropdowns();
      return;
    }

    // --- Toggle pill option ---
    var pillOpt = target.closest('.pill-opt');
    if (pillOpt) {
      var pill = pillOpt.closest('.toggle-pill');
      var pillAction = pill ? pill.getAttribute('data-action') : null;
      var pillValue = pillOpt.getAttribute('data-value');
      if (pillAction && pillValue) { vscode.postMessage({ type: pillAction, value: pillValue }); }
      return;
    }

    // --- Tool button ---
    var toolBtn = target.closest('.tool-btn[data-action]');
    if (toolBtn) {
      var toolAction = toolBtn.getAttribute('data-action');
      if (toolAction) { vscode.postMessage({ type: toolAction }); }
      return;
    }

    // --- Refresh ---
    if (target.closest('#btn-refresh')) {
      var iframe = document.getElementById('preview-iframe');
      if (iframe && iframe.src) { iframe.src = iframe.src; }
      return;
    }

    // --- Screenshot ---
    if (target.closest('#btn-screenshot')) {
      vscode.postMessage({ type: 'screenshot' });
      return;
    }

    // --- Clip editor ---
    if (target.closest('#btn-clip')) {
      vscode.postMessage({ type: 'openClipEditor' });
      return;
    }

    // --- Close all dropdowns on any other click ---
    closeAllDropdowns();
  });

  // ------------------------------------------------------------------
  // Custom dimensions (keydown + blur)
  // ------------------------------------------------------------------

  document.addEventListener('keydown', function (e) {
    var target = /** @type {HTMLInputElement} */ (e.target);
    if (e.key === 'Enter') {
      if (target.id === 'custom-w' || target.id === 'custom-h') {
        commitCustomDims();
      }
      if (target.id === 'url-input') {
        var url = target.value.trim();
        if (url) { vscode.postMessage({ type: 'urlChange', url: url }); }
      }
    }
  });

  document.addEventListener('blur', function (e) {
    var target = /** @type {HTMLInputElement} */ (e.target);
    if (target.id === 'custom-w' || target.id === 'custom-h') {
      commitCustomDims();
    }
  }, true);

  function commitCustomDims() {
    var customW = /** @type {HTMLInputElement|null} */ (document.getElementById('custom-w'));
    var customH = /** @type {HTMLInputElement|null} */ (document.getElementById('custom-h'));
    if (!customW || !customH) { return; }
    var w = Math.max(200, Math.min(3840, parseInt(customW.value, 10) || config.customWidth || 1280));
    var h = Math.max(200, Math.min(2160, parseInt(customH.value, 10) || config.customHeight || 720));
    vscode.postMessage({ type: 'setCustomDimensions', width: w, height: h });
  }

  // ------------------------------------------------------------------
  // Scale device frame to fit
  // ------------------------------------------------------------------

  function applyDeviceScale() {
    var deviceFrame = document.getElementById('device-frame');
    if (!deviceFrame) { return; }
    var previewArea = document.getElementById('preview-area');
    if (!previewArea) { return; }

    var areaRect = previewArea.getBoundingClientRect();
    var maxW = areaRect.width - 32;
    var maxH = areaRect.height - 32;

    var frameW = deviceFrame.scrollWidth;
    var frameH = deviceFrame.scrollHeight;
    if (frameW === 0 || frameH === 0) { return; }

    var scale = Math.min(maxW / frameW, maxH / frameH, 1);
    deviceFrame.style.transform = 'scale(' + scale + ')';
    deviceFrame.style.transformOrigin = 'center center';
  }

  // ------------------------------------------------------------------
  // Partial DOM update — replaces toolbar + frame chrome without
  // destroying the iframe (keeps page state alive)
  // ------------------------------------------------------------------

  function applyPartialUpdate(msg) {
    var iframe = document.getElementById('preview-iframe');
    if (!iframe) { return; }

    // 1. Update toolbar
    if (msg.toolbarHtml) {
      var toolbar = document.getElementById('toolbar');
      if (toolbar) {
        toolbar.outerHTML = msg.toolbarHtml;
      }
    }

    // 2. Update status bar
    if (msg.statusBarHtml !== undefined) {
      var statusBar = document.querySelector('.status-bar');
      if (statusBar) {
        statusBar.innerHTML = msg.statusBarHtml;
        if (msg.statusBarBg) { statusBar.style.background = msg.statusBarBg; }
      }
    }

    // 3. Update chrome bars — remove old, insert new around the iframe
    var oldChromeBars = document.querySelectorAll('.chrome-bar');
    oldChromeBars.forEach(function (el) { el.remove(); });

    // Remove old home indicator (non-chrome one)
    var oldHomeInd = document.querySelector('.home-indicator');
    if (oldHomeInd) { oldHomeInd.remove(); }

    if (msg.chromeTopHtml) {
      iframe.insertAdjacentHTML('beforebegin', msg.chromeTopHtml);
    }
    if (msg.chromeBottomHtml) {
      iframe.insertAdjacentHTML('afterend', msg.chromeBottomHtml);
    }
    if (msg.homeIndicatorHtml) {
      // Insert after the last sibling after iframe (chromeBottom if present, else iframe)
      var afterEl = iframe.nextElementSibling || iframe;
      afterEl.insertAdjacentHTML('afterend', msg.homeIndicatorHtml);
    }

    // 4. Update debug overlay
    var debugOverlay = document.getElementById('debug-overlay');
    if (msg.debugHtml !== undefined) {
      if (debugOverlay) { debugOverlay.remove(); }
      if (msg.debugHtml) {
        document.body.insertAdjacentHTML('beforeend', msg.debugHtml);
      }
    }

    // Reset collapse state + indicator timer after chrome replacement
    chromeCollapsed = false;
    cancelIndicatorIdleTimer();
    showHomePills();

    // Apply overlay/flex mode + page bg to new chrome elements
    applyBottomChromeMode();

    // Re-apply scaling
    requestAnimationFrame(applyDeviceScale);
  }

  // ------------------------------------------------------------------
  // Full frame rebuild — updates ALL elements around the iframe
  // without ever moving the iframe itself. The iframe stays in place
  // in the DOM so its loaded page is never disrupted.
  //
  // Strategy:
  //   1. Remove all iframe siblings (status bar, chrome, island, etc.)
  //   2. Parse new frame HTML in a temp container
  //   3. Copy style/class from new #device-frame to existing one
  //   4. Copy structural wrappers' styles (bezel, screen-area)
  //   5. Move new iframe-siblings from temp into the real screen-area
  //   6. Replace outer elements (buttons, notch pad, laptop parts)
  // ------------------------------------------------------------------

  function rebuildFrame(msg) {
    var iframe = document.getElementById('preview-iframe');
    var previewArea = document.getElementById('preview-area');
    if (!iframe || !previewArea) { return; }

    // Parse new frame HTML in a disconnected container
    var temp = document.createElement('div');
    temp.innerHTML = msg.frameHtml;

    var newDeviceFrame = temp.querySelector('#device-frame');
    var oldDeviceFrame = document.getElementById('device-frame');

    if (!newDeviceFrame || !oldDeviceFrame) {
      // Fallback: can't do in-place, do innerHTML (iframe will reload)
      previewArea.innerHTML = msg.frameHtml;
      var slot = document.getElementById('iframe-slot');
      if (slot && slot.parentNode) { slot.parentNode.replaceChild(iframe, slot); }
      finishRebuild(msg);
      return;
    }

    var oldScreenArea = oldDeviceFrame.querySelector('.screen-area');
    var newScreenArea = newDeviceFrame.querySelector('.screen-area');

    if (!oldScreenArea && !newScreenArea) {
      // Both custom mode (no screen-area): just update device-frame style
      oldDeviceFrame.className = newDeviceFrame.className;
      oldDeviceFrame.setAttribute('style', newDeviceFrame.getAttribute('style') || '');
      finishRebuild(msg);
      return;
    }

    if (!oldScreenArea || !newScreenArea) {
      // Structure mismatch (e.g. switching between custom and phone/laptop)
      // Fall back: replace device-frame innerHTML, reattach iframe
      previewArea.innerHTML = msg.frameHtml;
      var slot2 = document.getElementById('iframe-slot');
      if (slot2 && slot2.parentNode) { slot2.parentNode.replaceChild(iframe, slot2); }
      finishRebuild(msg);
      return;
    }

    // --- 1. Update #device-frame attributes ---
    oldDeviceFrame.className = newDeviceFrame.className;
    oldDeviceFrame.setAttribute('style', newDeviceFrame.getAttribute('style') || '');

    // --- 2. Update wrapper structure between device-frame and screen-area ---
    // Walk from screen-area up to device-frame in both old and new trees
    // and sync styles on each wrapper level
    var oldWrappers = getWrapperChain(oldScreenArea, oldDeviceFrame);
    var newWrappers = getWrapperChain(newScreenArea, newDeviceFrame);

    // If wrapper depth changed, we need to restructure
    if (oldWrappers.length !== newWrappers.length) {
      // Different nesting depth — fall back to full rebuild with iframe reattach
      previewArea.innerHTML = msg.frameHtml;
      var slot3 = document.getElementById('iframe-slot');
      if (slot3 && slot3.parentNode) { slot3.parentNode.replaceChild(iframe, slot3); }
      finishRebuild(msg);
      return;
    }

    // Sync styles and non-structural children on each wrapper level
    for (var i = 0; i < oldWrappers.length; i++) {
      oldWrappers[i].setAttribute('style', newWrappers[i].getAttribute('style') || '');
      oldWrappers[i].className = newWrappers[i].className;

      // Sync siblings of the structural child within this wrapper
      // (e.g., .webcam inside .laptop-lid alongside .screen-area)
      var structChild = i === oldWrappers.length - 1 ? oldScreenArea : oldWrappers[i + 1];
      var newStructChild = i === newWrappers.length - 1 ? newScreenArea : newWrappers[i + 1];

      // Remove old non-structural siblings
      var wChildren = Array.from(oldWrappers[i].childNodes);
      for (var w = 0; w < wChildren.length; w++) {
        if (wChildren[w] !== structChild) {
          oldWrappers[i].removeChild(wChildren[w]);
        }
      }

      // Collect new siblings: split into before/after the structural child
      var beforeNodes = [];
      var afterNodes = [];
      var seenStruct = false;
      var newWChildren = Array.from(newWrappers[i].childNodes);
      for (var nw = 0; nw < newWChildren.length; nw++) {
        if (newWChildren[nw] === newStructChild) {
          seenStruct = true;
        } else if (!seenStruct) {
          beforeNodes.push(newWChildren[nw]);
        } else {
          afterNodes.push(newWChildren[nw]);
        }
      }

      // Insert before-nodes before the structural child
      for (var b = 0; b < beforeNodes.length; b++) {
        oldWrappers[i].insertBefore(beforeNodes[b], structChild);
      }
      // Append after-nodes after the structural child
      for (var a = 0; a < afterNodes.length; a++) {
        oldWrappers[i].appendChild(afterNodes[a]);
      }
    }

    // --- 3. Update screen-area style ---
    oldScreenArea.setAttribute('style', newScreenArea.getAttribute('style') || '');
    oldScreenArea.className = newScreenArea.className;

    // --- 4. Remove all iframe siblings (everything except the iframe) ---
    var children = Array.from(oldScreenArea.childNodes);
    for (var c = 0; c < children.length; c++) {
      if (children[c] !== iframe) { children[c].remove ? children[c].remove() : oldScreenArea.removeChild(children[c]); }
    }

    // --- 5. Move new siblings from parsed screen-area into real screen-area ---
    // Find the iframe-slot in new HTML to know where to split before/after
    var newSlot = newScreenArea.querySelector('#iframe-slot');
    if (newSlot) {
      // Insert everything before the slot as "before iframe" content
      while (newScreenArea.firstChild && newScreenArea.firstChild !== newSlot) {
        oldScreenArea.insertBefore(newScreenArea.firstChild, iframe);
      }
      // Remove the slot itself
      if (newSlot.parentNode) { newSlot.remove(); }
      // Insert everything after the slot as "after iframe" content
      while (newScreenArea.firstChild) {
        oldScreenArea.appendChild(newScreenArea.firstChild);
      }
    }

    // --- 6. Update outer frame elements (buttons, notch pad, laptop base) ---
    // These are children of #device-frame that are NOT the wrapper chain root
    var outerAnchor = oldWrappers.length > 0 ? oldWrappers[0] : oldScreenArea;
    var newOuterAnchor = newWrappers.length > 0 ? newWrappers[0] : newScreenArea;

    // Remove old outer elements
    var dfChildren = Array.from(oldDeviceFrame.childNodes);
    for (var d = 0; d < dfChildren.length; d++) {
      if (dfChildren[d] !== outerAnchor) {
        oldDeviceFrame.removeChild(dfChildren[d]);
      }
    }

    // Collect new outer elements: split into before/after the anchor
    var outerBefore = [];
    var outerAfter = [];
    var seenAnchor = false;
    var newDfChildren = Array.from(newDeviceFrame.childNodes);
    for (var e = 0; e < newDfChildren.length; e++) {
      if (newDfChildren[e] === newOuterAnchor) {
        seenAnchor = true;
      } else if (!seenAnchor) {
        outerBefore.push(newDfChildren[e]);
      } else {
        outerAfter.push(newDfChildren[e]);
      }
    }
    for (var ob = 0; ob < outerBefore.length; ob++) {
      oldDeviceFrame.insertBefore(outerBefore[ob], outerAnchor);
    }
    for (var oa = 0; oa < outerAfter.length; oa++) {
      oldDeviceFrame.appendChild(outerAfter[oa]);
    }

    finishRebuild(msg);
  }

  /** Get the chain of wrapper elements between inner and outer (exclusive) */
  function getWrapperChain(inner, outer) {
    var chain = [];
    var el = inner.parentElement;
    while (el && el !== outer) {
      chain.push(el);
      el = el.parentElement;
    }
    return chain;
  }

  function finishRebuild(msg) {
    // Update toolbar
    if (msg.toolbarHtml) {
      var toolbar = document.getElementById('toolbar');
      if (toolbar) {
        toolbar.outerHTML = msg.toolbarHtml;
      }
    }

    // Update debug overlay
    var debugOverlay = document.getElementById('debug-overlay');
    if (debugOverlay) { debugOverlay.remove(); }
    if (msg.debugHtml) {
      document.body.insertAdjacentHTML('beforeend', msg.debugHtml);
    }

    // Reset collapse state + indicator timer
    chromeCollapsed = false;
    cancelIndicatorIdleTimer();
    showHomePills();

    // Apply overlay/flex mode + page bg to new chrome elements
    applyBottomChromeMode();

    // Re-apply scaling to fit the new dimensions
    requestAnimationFrame(applyDeviceScale);
  }

  // ------------------------------------------------------------------
  // Listen for messages from extension AND iframe bridge
  // ------------------------------------------------------------------

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || !msg.type) { return; }

    switch (msg.type) {
      // --- Extension messages ---
      case 'setUrl':
        var iframe = document.getElementById('preview-iframe');
        if (iframe) { iframe.src = msg.url; }
        currentDisplayUrl = msg.displayUrl || msg.url;
        var urlInput = document.getElementById('url-input');
        if (urlInput) { urlInput.value = currentDisplayUrl; }
        // Update hostname in chrome bars
        try {
          var parsedSetUrl = new URL(currentDisplayUrl);
          var hostnameEls = document.querySelectorAll('[data-chrome-hostname]');
          for (var hi = 0; hi < hostnameEls.length; hi++) {
            hostnameEls[hi].textContent = parsedSetUrl.hostname;
          }
        } catch(eu) {}
        // Remove empty state
        var emptyOv = document.getElementById('empty-state-overlay');
        if (emptyOv) { emptyOv.remove(); }
        // Reset scroll state on navigation
        chromeCollapsed = false;
        scrollCooldown = true;
        setTimeout(function () { scrollCooldown = false; }, 500);
        break;

      case 'refresh':
        var iframe2 = document.getElementById('preview-iframe');
        if (iframe2 && iframe2.src) { iframe2.src = iframe2.src; }
        break;

      case 'updateView':
        // Sync bottomNavDetected from extension's resolved state
        if (msg.hasBottomNav !== undefined) { bottomNavDetected = !!msg.hasBottomNav; }
        applyPartialUpdate(msg);
        // Brief cooldown to ignore stale scroll events
        scrollCooldown = true;
        setTimeout(function () { scrollCooldown = false; }, 500);
        break;

      case 'rebuildFrame':
        // Sync bottomNavDetected from extension's resolved state
        if (msg.hasBottomNav !== undefined) { bottomNavDetected = !!msg.hasBottomNav; }
        rebuildFrame(msg);
        // Brief cooldown to ignore stale scroll events
        scrollCooldown = true;
        setTimeout(function () { scrollCooldown = false; }, 500);
        break;

      case 'setPageBgColor':
        // Extension sends page bg color — used for chrome backing in flex mode
        if (msg.color) {
          lastPageBgColor = msg.color;
          applyPageBgToChrome();
        }
        break;

      case 'setScreenBg':
        // Extension sends page bg color for status bar + screen area
        // Matches original DeviceFrame.tsx where barBg = pageColor
        if (msg.color) {
          var statusBarEl = document.querySelector('.status-bar');
          if (statusBarEl) { statusBarEl.style.background = msg.color; }
          var screenAreaEl = document.querySelector('.screen-area');
          if (screenAreaEl) { screenAreaEl.style.background = msg.color; }
        }
        break;

      case 'setRecentWorkspaces':
        recentWorkspaces = msg.workspaces || [];
        updateEmptyState();
        break;

      // --- Bridge messages from the embedded page (via proxy injection) ---
      case '__bridge_scroll':
        if (scrollCooldown) { break; }
        var shouldCollapse = msg.dir === 'down';
        if (scrollDebounce) { clearTimeout(scrollDebounce); }
        scrollDebounce = setTimeout(function () {
          if (shouldCollapse !== chromeCollapsed) {
            setCollapsed(shouldCollapse);
          }
        }, 50);
        break;

      case '__bridge_meta':
        // Forward page meta to extension
        vscode.postMessage({
          type: 'pageMeta',
          bgColor: msg.bgColor || '',
          title: msg.title || '',
          favicon: msg.favicon || '',
        });

        // Update tab title in desktop chrome
        var tabTitleEl = document.querySelector('[data-chrome-tab-title]');
        if (tabTitleEl && msg.title) {
          tabTitleEl.textContent = msg.title;
        }

        // Update favicon in desktop chrome
        var faviconEl = document.querySelector('[data-chrome-tab-favicon]');
        if (faviconEl && msg.favicon) {
          faviconEl.innerHTML = '';
          var favImg = document.createElement('img');
          favImg.src = msg.favicon;
          favImg.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
          favImg.onerror = function() { faviconEl.innerHTML = ''; };
          faviconEl.appendChild(favImg);
        }
        break;

      case '__bridge_bottomnav':
        // Forward bottom nav detection to extension
        bottomNavDetected = !!msg.detected;
        vscode.postMessage({
          type: 'bottomNavDetected',
          detected: bottomNavDetected,
        });
        // Switch chrome between overlay (absolute) and flex mode
        applyBottomChromeMode();
        break;

      case '__bridge_nav':
        // SPA navigation detected — update chrome hostname + tab title
        try {
          var navUrl = new URL(msg.url);
          var newHostname = navUrl.hostname;
          var spaHostnameEls = document.querySelectorAll('[data-chrome-hostname]');
          for (var si = 0; si < spaHostnameEls.length; si++) {
            spaHostnameEls[si].textContent = newHostname;
          }
          currentDisplayUrl = msg.url;
        } catch(ne) {}
        if (msg.title) {
          var spaTabTitle = document.querySelector('[data-chrome-tab-title]');
          if (spaTabTitle) { spaTabTitle.textContent = msg.title; }
        }
        // Forward to extension for state tracking
        vscode.postMessage({type: 'spaNavigation', url: msg.url, title: msg.title || ''});
        break;
    }
  });

  // ------------------------------------------------------------------
  // Empty state management
  // ------------------------------------------------------------------

  function updateEmptyState() {
    // @ts-ignore
    var currentUrl = typeof CURRENT_URL !== 'undefined' ? CURRENT_URL : '';
    var iframe = document.getElementById('preview-iframe');
    var hasUrl = iframe && iframe.src && iframe.src !== 'about:blank' && iframe.src !== '';
    var emptyEl = document.getElementById('empty-state-overlay');

    if (!hasUrl && !currentUrl) {
      // Show empty state
      if (emptyEl) { emptyEl.remove(); }
      if (iframe && iframe.parentElement) {
        emptyEl = document.createElement('div');
        emptyEl.id = 'empty-state-overlay';
        emptyEl.className = 'empty-state';

        if (recentWorkspaces.length > 0) {
          // Render recent workspaces list
          var html = '<div class="workspace-header">Recent</div>' +
            '<div class="workspace-list">';
          for (var i = 0; i < recentWorkspaces.length; i++) {
            var ws = recentWorkspaces[i];
            var abbrevPath = ws.path.length > 40
              ? '...' + ws.path.substring(ws.path.length - 37)
              : ws.path;
            html += '<div class="workspace-item" data-path="' + ws.path.replace(/"/g, '&quot;') + '">' +
              '<span class="workspace-icon">\uD83D\uDCC1</span>' +
              '<div class="workspace-info">' +
                '<div class="workspace-name">' + ws.name + '</div>' +
                '<div class="workspace-path">' + abbrevPath + '</div>' +
              '</div>' +
            '</div>';
          }
          html += '</div>' +
            '<div class="empty-hint" style="margin-top:12px">Or start a dev server — URLs will auto-detect from terminal output.</div>';
          emptyEl.innerHTML = html;
        } else {
          emptyEl.innerHTML = '<div class="empty-title">No preview loaded</div>' +
            '<div class="empty-hint">Start a dev server or enter a URL in the address bar above. ' +
            'The preview will auto-detect localhost URLs from terminal output.</div>';
        }

        emptyEl.style.position = 'absolute';
        emptyEl.style.inset = '0';
        emptyEl.style.zIndex = '2';
        iframe.parentElement.style.position = 'relative';
        iframe.parentElement.appendChild(emptyEl);
      }
    } else {
      // Hide empty state
      if (emptyEl) { emptyEl.remove(); }
    }
  }

  // Handle workspace item clicks via event delegation
  document.addEventListener('click', function(e) {
    var item = /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement} */ (e.target).closest('.workspace-item') : null;
    if (item && item.dataset && item.dataset.path) {
      vscode.postMessage({ type: 'openWorkspace', path: item.dataset.path });
    }
  });

  // ------------------------------------------------------------------
  // Chrome navigation buttons (back / forward / reload)
  // ------------------------------------------------------------------

  document.addEventListener('click', function(e) {
    var actionEl = /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement} */ (e.target).closest('[data-chrome-action]') : null;
    if (!actionEl) { return; }
    var action = actionEl.getAttribute('data-chrome-action');
    var navIframe = document.getElementById('preview-iframe');
    if (!navIframe) { return; }

    if (action === 'back') {
      navIframe.contentWindow.postMessage({type:'__bridge_command', cmd:'back'}, '*');
    } else if (action === 'forward') {
      navIframe.contentWindow.postMessage({type:'__bridge_command', cmd:'forward'}, '*');
    } else if (action === 'reload') {
      navIframe.src = navIframe.src;
    }
  });

  // ------------------------------------------------------------------
  // Chrome URL bar — inline editor
  // ------------------------------------------------------------------

  document.addEventListener('click', function(e) {
    var urlEl = /** @type {HTMLElement} */ (e.target).closest ? /** @type {HTMLElement} */ (e.target).closest('[data-chrome-url]') : null;
    if (!urlEl || urlEditorInput) { return; }
    // Don't open editor if clicking an action button inside the chrome
    if (/** @type {HTMLElement} */ (e.target).closest('[data-chrome-action]')) { return; }
    openChromeUrlEditor(urlEl);
  });

  function openChromeUrlEditor(container) {
    var rect = container.getBoundingClientRect();
    urlEditorInput = document.createElement('input');
    urlEditorInput.type = 'text';
    urlEditorInput.className = 'chrome-url-editor';
    urlEditorInput.value = currentDisplayUrl || '';
    urlEditorInput.style.position = 'fixed';
    urlEditorInput.style.left = rect.left + 'px';
    urlEditorInput.style.top = rect.top + 'px';
    urlEditorInput.style.width = rect.width + 'px';
    urlEditorInput.style.height = rect.height + 'px';
    urlEditorInput.style.borderRadius = getComputedStyle(container).borderRadius || '18px';

    document.body.appendChild(urlEditorInput);
    urlEditorInput.focus();
    urlEditorInput.select();

    urlEditorInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        var newUrl = urlEditorInput.value.trim();
        if (newUrl && !newUrl.match(/^https?:\/\//)) { newUrl = 'http://' + newUrl; }
        if (newUrl) { vscode.postMessage({type: 'urlChange', url: newUrl}); }
        closeChromeUrlEditor();
      } else if (ev.key === 'Escape') {
        closeChromeUrlEditor();
      }
    });

    urlEditorInput.addEventListener('blur', function() {
      closeChromeUrlEditor();
    });
  }

  function closeChromeUrlEditor() {
    if (urlEditorInput) {
      urlEditorInput.remove();
      urlEditorInput = null;
    }
  }

  // ------------------------------------------------------------------
  // Signal ready
  // ------------------------------------------------------------------

  vscode.postMessage({ type: 'ready' });

  // Apply initial scaling and empty state
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      applyDeviceScale();
      updateEmptyState();
    });
  });
  window.addEventListener('resize', applyDeviceScale);
})();
