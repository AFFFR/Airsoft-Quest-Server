```js
var socket = io();

var state = null;
var map = null;
var gpsMarker = null;
var gameCode = "";
var objMarkers = new Map();
var playerMarkers = new Map();

function $(id) {
    return document.getElementById(id);
}

function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
        var r = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return r[c];
    });
}

function enter(code) {
    gameCode = code;

    $("login").classList.add("hidden");
    $("main").classList.remove("hidden");
    $("top").classList.remove("hidden");

    $("codeLabel").textContent = "Partida " + code;

    map = L.map("map").setView([39.5, -8], 7);

    L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            maxZoom: 20,
            attribution: "Tiles © Esri"
        }
    ).addTo(map);
}

function render() {
    if (!state) return;

    $("rscore").textContent = state.scores.RED;
    $("bscore").textContent = state.scores.BLUE;

    var html = "";

    if (state.objects.length === 0) {
        html = "<div class='small'>Sem objetivos.</div>";
    } else {
        state.objects.sort(function(a, b) {
            return a.order - b.order;
        });

        state.objects.forEach(function(o) {
            html +=
                "<div class='card'>" +
                "<b>" + o.order + ". " + esc(o.name) + "</b> " +
                "<span class='tag'>" + esc(o.team) + "</span><br>" +
                esc(o.desc) + "<br>" +
                "<span class='small'>" +
                "QR: " + esc(o.qr) +
                " · " + o.points + " pts" +
                " · raio " + o.radius + " m" +
                "</span><br>" +
                "<img class='objphoto' src='/qr?data=" +
                encodeURIComponent(o.qr) +
                "'>" +
                "<div class='row'>" +
                "<a href='/qr?data=" +
                encodeURIComponent(o.qr) +
                "' download='" +
                esc(o.name) +
                "_QR.png'>" +
                "<button>⬇ Guardar QR</button>" +
                "</a>" +
                "<button class='danger' onclick=\"delObj('" +
                o.id +
                "')\">APAGAR</button>" +
                "</div>" +
                "</div>";
        });
    }

    $("objects").innerHTML = html;

    var ps = Object.values(state.players);
    var playersHtml = "";

    if (ps.length === 0) {
        playersHtml = "Sem jogadores.";
    } else {
        ps.forEach(function(p) {
            var position = "GPS sem posição";

            if (p.lat != null && p.lon != null) {
                position =
                    Number(p.lat).toFixed(5) +
                    ", " +
                    Number(p.lon).toFixed(5);
            }

            var teamClass = p.team === "RED" ? "red" : "blue";

            playersHtml +=
                "<div>" +
                "<b>" + esc(p.name) + "</b> " +
                "<span class='tag " + teamClass + "'>" +
                esc(p.team) +
                "</span> " +
                position +
                "</div>";
        });
    }

    $("players").innerHTML = playersHtml;

    objMarkers.forEach(function(marker, id) {
        var exists = state.objects.some(function(o) {
            return o.id === id;
        });

        if (!exists) {
            map.removeLayer(marker);
            objMarkers.delete(id);
        }
    });

    state.objects.forEach(function(o) {
        var pop =
            "<b>" + esc(o.name) + "</b><br>" +
            esc(o.desc) + "<br>" +
            o.points + " pts · " +
            o.radius + " m<br>" +
            "<img class='objphoto' src='/qr?data=" +
            encodeURIComponent(o.qr) +
            "'>";

        if (objMarkers.has(o.id)) {
            objMarkers.get(o.id)
                .setLatLng([o.lat, o.lon])
                .setPopupContent(pop);
        } else {
            var marker = L.marker([o.lat, o.lon])
                .addTo(map)
                .bindPopup(pop);

            objMarkers.set(o.id, marker);
        }
    });

    playerMarkers.forEach(function(marker, id) {
        if (!state.players[id]) {
            map.removeLayer(marker);
            playerMarkers.delete(id);
        }
    });

    ps.forEach(function(p) {
        if (p.lat == null || p.lon == null) return;

        var pop = esc(p.name) + " · " + esc(p.team);

        if (playerMarkers.has(p.id)) {
            playerMarkers.get(p.id)
                .setLatLng([p.lat, p.lon])
                .setPopupContent(pop);
        } else {
            var marker = L.circleMarker([p.lat, p.lon])
                .addTo(map)
                .bindPopup(pop);

            playerMarkers.set(p.id, marker);
        }
    });
}

function compress(file) {
    return new Promise(function(resolve, reject) {
        if (!file) {
            resolve(null);
            return;
        }

        var reader = new FileReader();

        reader.onload = function() {
            var img = new Image();

            img.onload = function() {
                var canvas = document.createElement("canvas");
                var max = 1200;
                var scale = Math.min(
                    1,
                    max / Math.max(img.width, img.height)
                );

                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);

                var ctx = canvas.getContext("2d");

                ctx.drawImage(
                    img,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                resolve(
                    canvas.toDataURL("image/jpeg", 0.78)
                );
            };

            img.onerror = reject;
            img.src = reader.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function send(name, data, callback) {
    data.gameCode = gameCode;
    socket.emit(name, data, callback);
}


/* =========================
   CRIAR PARTIDA
   ========================= */

$("create").onclick = function() {

    gameCode = $("game").value.trim().toUpperCase();

    var gmCode = $("gm").value.trim();

    if (!gameCode) {
        $("err").textContent = "Introduz o código da partida.";
        return;
    }

    if (!gmCode) {
        $("err").textContent = "Introduz o código GM.";
        return;
    }

    send(
        "create_game",
        {
            gmCode: gmCode
        },
        function(r) {

            if (!r || !r.ok) {
                $("err").textContent =
                    r && r.error ?
                    r.error :
                    "Erro ao criar a partida.";
                return;
            }

            enter(gameCode);
        }
    );
};


/* =========================
   ENTRAR NA PARTIDA
   ========================= */

$("enter").onclick = function() {

    gameCode = $("game").value.trim().toUpperCase();

    var gmCode = $("gm").value.trim();

    if (!gameCode) {
        $("err").textContent = "Introduz o código da partida.";
        return;
    }

    if (!gmCode) {
        $("err").textContent = "Introduz o código GM.";
        return;
    }

    send(
        "gm_login",
        {
            gmCode: gmCode
        },
        function(r) {

            if (!r || !r.ok) {
                $("err").textContent =
                    r && r.error ?
                    r.error :
                    "Erro ao entrar na partida.";
                return;
            }

            enter(gameCode);
        }
    );
};


/* =========================
   CONTROLOS
   ========================= */

$("start").onclick = function() {
    socket.emit("set_started", true);
};

$("stop").onclick = function() {
    socket.emit("set_started", false);
};

$("reset").onclick = function() {
    if (confirm("Reiniciar jogo e pontuações?")) {
        socket.emit("reset");
    }
};

$("visibility").onchange = function(e) {
    socket.emit("set_visibility", e.target.value);
};


/* =========================
   GPS
   ========================= */

$("mygps").onclick = function() {

    navigator.geolocation.getCurrentPosition(
        function(p) {

            $("lat").value =
                p.coords.latitude.toFixed(6);

            $("lon").value =
                p.coords.longitude.toFixed(6);

            map.setView(
                [
                    p.coords.latitude,
                    p.coords.longitude
                ],
                18
            );

            if (gpsMarker) {

                gpsMarker.setLatLng([
                    p.coords.latitude,
                    p.coords.longitude
                ]);

            } else {

                gpsMarker = L.marker([
                    p.coords.latitude,
                    p.coords.longitude
                ])
                .addTo(map)
                .bindPopup("GPS do Game Master");
            }
        },
        function(e) {
            alert("GPS: " + e.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
};


/* =========================
   NOVO OBJETIVO
   ========================= */

$("add").onclick = async function() {

    var name = $("name").value.trim();
    var qr = $("qr").value.trim();

    var lat = Number($("lat").value);
    var lon = Number($("lon").value);

    if (
        !name ||
        !qr ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
    ) {
        alert(
            "Preenche nome, QR e coordenadas."
        );
        return;
    }

    var photo = await compress(
        $("photo").files[0]
    );

    send(
        "add_object",
        {
            name: name,
            desc: $("desc").value,
            team: $("team").value,
            points: $("points").value,
            radius: $("radius").value,
            qr: qr,
            lat: lat,
            lon: lon,
            photo: photo
        },
        function(r) {

            if (!r.ok) {
                alert(r.error);
                return;
            }

            $("name").value = "";
            $("desc").value = "";
            $("qr").value = "";
            $("photo").value = "";
        }
    );
};


/* =========================
   APAGAR OBJETIVO
   ========================= */

window.delObj = function(id) {

    socket.emit(
        "delete_object",
        id,
        function(r) {

            if (r && !r.ok) {
                alert(r.error);
            }
        }
    );
};


/* =========================
   ESTADO DO SERVIDOR
   ========================= */

socket.on("state", function(s) {
    state = s;
    render();
});
```
