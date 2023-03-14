function onTestConnection() {
    const email = $('#email').val();
    const password = $('#password').val();
    const endpoint = $('#endpoint').val();
    if (email && password && endpoint) {
        $("#test-connection").addClass( "loading");
        $("#test-connection-spinner").removeClass( "hidden");
        $.ajax(
            {
                    url: "api/v1/test-connection",
                    type: 'POST',
                    data: {
                        endpoint,
                        email,
                        password
                    },
                    success: function(result){
                        $("#test-connection").removeClass( "loading");
                        $("#test-connection-spinner").addClass( "hidden");
                        if (result.valid) {
                            $( "#save-connection" ).prop( "disabled", false );
                            Toastify({
                                text: "Connection to Tiko API was successful!",
                                duration: 5000,
                                gravity: "bottom",
                                position: "center",
                                style: {
                                    'background': 'var(--nord14)',
                                    'font-family': 'inter, sans-serif',
                                    'color': 'var(--nord6)'
                                }
                            }).showToast();
                        } else {
                            Toastify({
                                text: "Connection to Tiko API could not be established.",
                                duration: 5000,
                                gravity: "bottom",
                                position: "center",
                                style: {
                                    'background': 'var(--nord11)',
                                    'font-family': 'inter, sans-serif',
                                    'color': 'var(--nord6)'
                                }
                            }).showToast();
                        }

                    }
            }
        );
    } else {
        Toastify({
            text: "Please fill in all the fields.",
            duration: 5000,
            gravity: "bottom",
            position: "center",
            style: {
                'background': 'var(--nord11)',
                'font-family': 'inter, sans-serif',
                'color': 'var(--nord6)'
            }
        }).showToast();
    }
}

function onSaveConnection() {
    const email = $('#email').val();
    const password = $('#password').val();
    const endpoint = $('#endpoint').val();
    $("#save-connection").addClass( "loading");
    $("#save-connection-spinner").removeClass( "hidden");
    $.ajax(
        {
            url: "api/v1/save-connection",
            type: 'POST',
            data: {
                endpoint,
                email,
                password
            },
            success: function(result){
                $("#save-connection").removeClass( "loading");
                $("#save-connection-spinner").addClass( "hidden");
                Toastify({
                    text: "Your connection data was saved!",
                    duration: 5000,
                    gravity: "bottom",
                    position: "center",
                    style: {
                        'background': 'var(--nord14)',
                        'font-family': 'inter, sans-serif',
                        'color': 'var(--nord6)'
                    }
                }).showToast();
                setTimeout(() => {
                    window.location.href = "/setup";
                }, 1000);
            }
        }
    );
}