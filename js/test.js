$(function() {
    let timer = setInterval(auto, 2000);
    let num = 0;
    let slideCount = $(".adbox_slides li").length;
    let lastIndex = slideCount - 1;

    function auto() {
        if (num >= lastIndex)
            num = -1;
        num++;
        $(".adbox_dot li").eq(num).css("background", "black")
                .siblings().css("background", "transparent");

        let move = 0 - 500 * num;
        $(".adbox_slides").css("left", move);
        if (num >= lastIndex)
            num = -1;
    }

    function show() {
        $(".adbox_dot li").eq(num).css("background", "black")
                .siblings().css("background", "transparent");

        let move = 0 - 500 * num;
        $(".adbox_slides").css("left", move);
    }

    $(".adbox").mouseover(function() {
        clearInterval(timer);
    });

    $(".adbox").mouseout(function() {
        timer = setInterval(auto, 2000);
    });

    $(".adbox_dot li").click(function() {
        clearInterval(timer);
        num = $(this).index();
        show();
    })

    $("#prevbtn").click(function() {
        num--;
        if (num < 0)
            num = lastIndex;
        show();
    })

    $("#nextbtn").click(function() {
        num++;
        if (num > lastIndex)
            num = 0;
        show();
    })

});