// MyComponent.code.js
export default `
const MyComponent = () => "Hello World"
`
import MyComponentCode from './MyComponent.code'

export default {
  title: 'Your story',
  parameters: {
    componentSource: {
      code: MyComponentCode,
      language: 'javascript',
    }
  },
}