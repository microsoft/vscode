import React, {Component} from 'react';

const styles = {
  title: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1rem',
    backgroundColor: '#cf4646',
    color: 'white'
  },
  h1: {
    fontWeight: 300,
    fontSize: '4rem',
    margin: '1rem'
  },
  logo: {
    height: '12rem',
    backgroundColor: 'white',
    borderRadius: '1rem',
    margin: '1rem'
  },
  h2: {
    fontWeight: 300,
    fontSize: '2rem',
    margin: '.5rem'
  }
};

export class Title extends Component {
  render() {
    return (
      <div style={styles.title}>
        <h1 style={styles.h1}>&apos;Allo, &apos;Allo!</h1>
        <div>
          <img style={styles.logo} src="http://fountainjs.io/assets/imgs/yeoman.png"/>
          <img style={styles.logo} src="http://fountainjs.io/assets/imgs/fountain.png"/>
        </div>
        <h2 style={styles.h2}>Always a pleasure scaffolding your apps.</h2>
      </div>
    );
  }
}
