const submitButton = document.getElementById('submit');
submitButton.onclick = () => {
    const oldPassword = document.getElementById('oldPassword').value
    const newPassword = document.getElementById('newPassword').value
    const confirmPassword = document.getElementById('confirmPassword').value
    axios.post('/password', {oldPassword, newPassword, confirmPassword})
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