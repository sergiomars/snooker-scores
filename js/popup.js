import {Player} from "./player.js";
import {getArray} from "./service.js";

setDefaults();

async function setDefaults() {
    const elements = await getArray('players.json');
    let players = [];
    for (let i = 0; i < elements.length; i++) {
        if (players.indexOf(i) === -1) {
            let element = elements[i];
            players.push(new Player(element.ID, element.FirstName, element.LastName));
        }
    }

    var rankingElements = await getArray('rankings.json');
    for (let i = 0; i < rankingElements.length; i++) {
        let playerIndex = players.findIndex(p => p.id === rankingElements[i].PlayerID);
        if (playerIndex === undefined) {
            console.log("Not found player " + rankingElements[i].PlayerID);
        } else {
            let player = players[playerIndex];
            if (player !== undefined) {
                console.log("Update ranking  for player " + player.id);
                players[playerIndex].ranking = rankingElements[i].Position;
                players[playerIndex].money = rankingElements[i].Sum;
                console.log("Updated ranking for player " + player.firstName + " " + player.lastName + " with ranking position " + player.ranking);
            }
        }

    }

    chrome.storage.local.set({
        players: players
    }, async function () {
    });
}

// Create Ranking Table.
async function createRankingTable() {
    chrome.storage.local.get(['players'], function (result) {
        const players = result.players.sort((a, b) => a.ranking > b.ranking ? 1 : -1);

        var table = document.createElement("table") // Create table header.
        var tr = table.insertRow(-1); // Table row. (last position)

        // Add JSON to the table rows.
        for (var i = 0; i < players.length; i++) {
            let tr = table.insertRow(-1);
            let tabCell1 = tr.insertCell(-1);
            tabCell1.innerHTML = players[i].ranking;
            let tabCell2 = tr.insertCell(-1);
            tabCell2.innerHTML = players[i].firstName + " " + players[i].lastName;
            let tabCell3 = tr.insertCell(-1);
            tabCell3.innerHTML = players[i].money;
        }

        // Finally, add the dynamic table to a container.
        var divContainer = document.getElementById("content");
        divContainer.innerHTML = "";
        divContainer.appendChild(table);
    });
}

async function createContent() {
    var divContainer = document.getElementById("content");
    divContainer.innerHTML = "";
}

document.getElementById("radio1").addEventListener('click', createContent);
document.getElementById("radio2").addEventListener('click', createContent);
document.getElementById("radio3").addEventListener('click', createRankingTable);
document.getElementById("radio4").addEventListener('click', createContent);