debugger;
// Create XMLHttpRequest object.
// const proxyurl = "https://cors-anywhere.herokuapp.com/";
// const url = "https://www.encodedna.com/library/sample.json";
fetch('players.json')
    .then(response => response.text())
    .then(contents => createTableFromJSON(contents))
    .catch((e) => console.log('error'))

// Create an HTML table using the JSON data.
function createTableFromJSON(jsonData) {
    var arrBirds = [];
    arrBirds = JSON.parse(jsonData); // Convert JSON to array.
    var col = [];
    for (var key in arrBirds) {
        console.log('key: ' + key);
        if (col.indexOf(key) === -1) {
            col.push(key);
        }
    }

    // Create a dynamic table.
    var table = document.createElement("table") // Create table header.
    var tr = table.insertRow(-1); // Table row. (last position)

    var th = document.createElement("th"); // Table header.
    th.innerHTML = "Name";
    tr.appendChild(th);

    var th = document.createElement("th"); // Table header.
    th.innerHTML = "Ranking";
    tr.appendChild(th);

    // Add JSON to the table rows.
    for (var i = 0; i < arrBirds.length; i++) {
        let tr = table.insertRow(-1);
        var tabCell = tr.insertCell(-1);
        tabCell.innerHTML = arrBirds[i].FirstName;
        var tabCell = tr.insertCell(-1);
        tabCell.innerHTML = arrBirds[i].LastName;
    }

    // Finally, add the dynamic table to a container.
    var divContainer = document.getElementById("ranking-table");
    divContainer.innerHTML = "";
    divContainer.appendChild(table);
}