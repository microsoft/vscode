import React, {Component} from 'react';
import axios from 'axios';

import {Tech} from './tech';

const styles = {
  container: {
    margin: '1rem'
  },
  h2: {
    fontWeight: 300,
    fontSize: '1.5rem'
  },
  techs: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around'
  }
};

export class Techs extends Component {
  constructor() {
    super();
    this.state = {techs: []};
  }

  componentDidMount() {
    axios
      .get('app/techs/techs.json')
      .then(response => {
        this.setState({techs: response.data});
      });
  }

  render() {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>
          Cooked with all these awesome technologies:
        </h2>
        <div style={styles.techs}>
          {this.state.techs.map((tech, i) => (
            <Tech key={i} tech={tech}/>
          ))}
        </div>
      </div>
    );
  }
}
