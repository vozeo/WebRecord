const submitButton = document.getElementById('submit');
submitButton.onclick = () => {
    const username = document.getElementById('username').value
    const password = document.getElementById('password').value
    axios.post('/login', {username, password})
        .then(response => {
            if (response.data.code && response.data.code !== 0) {
                alert(response.data.message)
            } else {
                window.location.replace('/');
            }
        })
        .catch(function (error) {
            alert(error.message)
        })
};