## Test Plan Items

A test plan item should specify its complexity from 1 till 5 and should have the platforms in which it has to be tested against. You can pre-assign them to a user you would like to test by adding his/her user id next to platform. If there are more than one authors for it, all the authors should be specified. Test plan item description should contain all these details. Following are the examples:

### Platforms

- macOS
- windows
- linux
- wsl
- ssh
- dev container
- anyOS

### Example 1 (Platforms)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] macOS
- [ ] linux
- [ ] windows

Complexity: 2

---

<!-- Please write your test here. -->

```

### Example 2 (Any platforms)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] anyOS
- [ ] anyOS

Complexity: 4

---

<!-- Please write your test here. -->

```

### Example 3 (One specific and other any platform)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] windows
- [ ] anyOS

Complexity: 4

---

<!-- Please write your test here. -->

```

### Example 4 (Pre-assigned)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] macOS: @user1
- [ ] linux

Complexity: 4

Authors: @user1, @user2

---

<!-- Please write your test here. -->

```

### Example 5 (Remote)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] wsl
- [ ] ssh
- [ ] dev container

Complexity: 2

---

<!-- Please write your test here. -->

```

### Example 6 (Multiple Authors)

```markdown

Refs: <!-- Refer to the issue that this test plan item is testing. -->

- [ ] windows
- [ ] linux

Complexity: 4

Authors: @user1, @user2

---

<!-- Please write your test here. -->

```

## Platform assignments

[Platforms](./platforms.json) has the list users and the platforms in which they can test. First platform is considered as primary platform. Please update this when there are changes.
