let yaml;

function onInit() {
    $.ajax(
        {
            url: "/api/v1/configuration/yaml",
            type: 'GET',
            success: function(result){
                yaml = result;
                $("#auto-yaml").html(Prism.highlight(result, Prism.languages.yaml, 'yaml'));
            }
        }
    );
}

function onCopy() {
    navigator.clipboard.writeText(yaml);
    Toastify({
        text: "The YAML was copied to your keyboard.",
        duration: 5000,
        gravity: "bottom",
        position: "center",
        style: {
            'background': 'var(--nord10)',
            'font-family': 'inter, sans-serif',
            'color': 'var(--nord6)'
        }
    }).showToast();
}

function onDownload() {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(yaml));
    element.setAttribute('download', 'tiko.yaml');

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

onInit();