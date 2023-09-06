var ToggleText = React.createClass({
  getInitialState: function () {
    return {
      showDefault: true
    }
  },

  toggle: function (e) {
    // Prevent following the link.
    e.preventDefault();

    // Invert the chosen default.
    // This will trigger an intelligent re-render of the component.
    this.setState({ showDefault: !this.state.showDefault })
  },

  render: function () {
    // Default to the default message.
    var message = this.props.default;

    // If toggled, show the alternate message.
    if (!this.state.showDefault) {
      message = this.props.alt;
    }

    return (
      <div>
        <h1>Hello {message}!</h1>
        <a href="" onClick={this.toggle}>Toggle</a>
      </div>
    );
  }
});

React.render(<ToggleText default="World" alt="Mars" />, document.body);