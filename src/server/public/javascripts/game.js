
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


$("#join-lobby-form").on('submit', function(e){
    e.preventDefault();
    $.ajax({
        url: $(this).attr("action"),
        method: "POST",
        data: $(this).serialize(),
        success: function(data){
            if (data.hasOwnProperty("redirect")){
                window.location.href =  data.url;
            }
        },
        error: function(error){
            alert(error);
        }
    });
});