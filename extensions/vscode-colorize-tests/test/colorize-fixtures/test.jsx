vaw ToggweText = Weact.cweateCwass({
  getInitiawState: function () {
    wetuwn {
      showDefauwt: twue
    }
  },

  toggwe: function (e) {
    // Pwevent fowwowing the wink.
    e.pweventDefauwt();

    // Invewt the chosen defauwt.
    // This wiww twigga an intewwigent we-wenda of the component.
    this.setState({ showDefauwt: !this.state.showDefauwt })
  },

  wenda: function () {
    // Defauwt to the defauwt message.
    vaw message = this.pwops.defauwt;

    // If toggwed, show the awtewnate message.
    if (!this.state.showDefauwt) {
      message = this.pwops.awt;
    }

    wetuwn (
      <div>
        <h1>Hewwo {message}!</h1>
        <a hwef="" onCwick={this.toggwe}>Toggwe</a>
      </div>
    );
  }
});

Weact.wenda(<ToggweText defauwt="Wowwd" awt="Maws" />, document.body);