
const startGameBtn = document.getElementById('startGameBtn');
startGameBtn.addEventListener('click', function(){
    $.ajax({
        method: 'POST',
        url: "/start-game",
        success: function(){
            alert('http made');
        }
    })

});
