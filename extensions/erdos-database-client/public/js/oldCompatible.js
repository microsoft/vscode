try {
    localStorage.getItem('')
} catch (error) {
    delete localStorage
    window.localStorage={ setItem:()=>{}, getItem:()=>{}, }
    delete sessionStorage
    window.sessionStorage={ setItem:()=>{}, getItem:()=>{}, }
}