```js
const socket=io();

let state=null,map=null,gpsMarker=null,gameCode="",objMarkers=new Map(),playerMarkers=new Map();

const $=id=>document.getElementById(id);

function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[c]));
}

function enter(code){
  gameCode=code;

  $("login").classList.add("hidden");
  $("main").classList.remove("hidden");
  $("top").classList.remove("hidden");

  $("codeLabel").textContent="Partida "+code;

  map=L.map("map").setView([39.5,-8],7);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom:20,
      attribution:"Tiles © Esri"
    }
  ).addTo(map);
}

function render(){
  if(!state)return;

  $("rscore").textContent=state.scores.RED;
  $("bscore").textContent=state.scores.BLUE;

  $("objects").innerHTML=
    state.objects
      .sort((a,b)=>a.order-b.order)
      .map(o=>`
        <div class="card">
          <b>${o.order}. ${esc(o.name)}</b>
          <span class="tag">${o.team}</span>
          <br>
          ${esc(o.desc)}
          <br>
          <span class="small">
            QR: ${esc(o.qr)} · ${o.points} pts · raio ${o.radius} m
          </span>
          <br>
          <img class="objphoto" src="/qr?data=${encodeURIComponent(o.qr)}">
          <div class="row">
            <a href="/qr?data=${encodeURIComponent(o.qr)}" download="${esc(o.name)}_QR.png">
              <button>⬇ Guardar QR</button>
            </a>
            <button class="danger" onclick="delObj('${o.id}')">
              APAGAR
            </button>
          </div>
        </div>
      `)
      .join("")
      ||
      "<div class='small'>Sem objetivos.</div>";

  const ps=Object.values(state.players);

  $("players").innerHTML=
    ps.map(p=>`
      <div>
        <b>${esc(p.name)}</b>
        <span class="tag ${p.team==="RED"?"red":"blue"}">${p.team}</span>
        ${
          p.lat!=null
          ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`
          : "GPS sem posição"
        }
      </div>
    `).join("")
    ||
    "Sem jogadores.";

  for(const [id,m] of objMarkers){
    if(!state.objects.some(o=>o.id===id)){
      map.removeLayer(m);
      objMarkers.delete(id);
    }
  }

  state.objects.forEach(o=>{
    const pop=`
      <b>${esc(o.name)}</b>
      <br>
      ${esc(o.desc)}
      <br>
      ${o.points} pts · ${o.radius} m
      <br>
      <img class="objphoto" src="/qr?data=${encodeURIComponent(o.qr)}">
    `;

    if(objMarkers.has(o.id)){
      objMarkers
        .get(o.id)
        .setLatLng([o.lat,o.lon])
        .setPopupContent(pop);
    }else{
      objMarkers.set(
        o.id,
        L.marker([o.lat,o.lon])
          .addTo(map)
          .bindPopup(pop)
      );
    }
  });

  for(const [id,m] of playerMarkers){
    if(!state.players[id]){
      map.removeLayer(m);
      playerMarkers.delete(id);
    }
  }

  ps.forEach(p=>{
    if(p.lat==null)return;

    const pop=`${esc(p.name)} · ${p.team}`;

    if(playerMarkers.has(p.id)){
      playerMarkers
        .get(p.id)
        .setLatLng([p.lat,p.lon])
        .setPopupContent(pop);
    }else{
      playerMarkers.set(
        p.id,
        L.circleMarker([p.lat,p.lon])
          .addTo(map)
          .bindPopup(pop)
      );
    }
  });
}

async function compress(file){
  return new Promise((resolve,reject)=>{
    if(!file)return resolve(null);

    const r=new FileReader();

    r.onload=()=>{
      const im=new Image();

      im.onload=()=>{
        const c=document.createElement("canvas");
        const max=1200;
        const s=Math.min(1,max/Math.max(im.width,im.height));

        c.width=Math.round(im.width*s);
        c.height=Math.round(im.height*s);

        c.getContext("2d").drawImage(
          im,
          0,
          0,
          c.width,
          c.height
        );

        resolve(c.toDataURL("image/jpeg",.78));
      };

      im.onerror=reject;
      im.src=r.result;
    };

    r.onerror=reject;
    r.readAsDataURL(file);
  });
}

/* IMPORTANTE:
   O código da partida está no campo id="game".
*/
function send(name,d,cb){
  socket.emit(
    name,
    {
      ...d,
      gameCode
    },
    cb
  );
}

/* CRIAR NOVA PARTIDA */
$("create").onclick=()=>{
  gameCode=$("game").value.trim().toUpperCase();

  const gmCode=$("gm").value.trim();

  if(!gameCode){
    $("err").textContent="Introduz o código da partida.";
    return;
  }

  if(!gmCode){
    $("err").textContent="Introduz o código GM.";
    return;
  }

  send(
    "create_game",
    {
      gmCode:gmCode
    },
    r=>{
      if(!r || !r.ok){
        $("err").textContent=r?.error || "Erro ao criar a partida.";
        return;
      }

      enter(gameCode);
    }
  );
};

/* ENTRAR NUMA PARTIDA EXISTENTE */
$("enter").onclick=()=>{
  gameCode=$("game").value.trim().toUpperCase();

  const gmCode=$("gm").value.trim();

  if(!gameCode){
    $("err").textContent="Introduz o código da partida.";
    return;
  }

  if(!gmCode){
    $("err").textContent="Introduz o código GM.";
    return;
  }

  send(
    "gm_login",
    {
      gmCode:gmCode
    },
    r=>{
      if(!r || !r.ok){
        $("err").textContent=r?.error || "Erro ao entrar na partida.";
        return;
      }

      enter(gameCode);
    }
  );
};

$("start").onclick=()=>{
  socket.emit("set_started",true);
};

$("stop").onclick=()=>{
  socket.emit("set_started",false);
};

$("reset").onclick=()=>{
  if(confirm("Reiniciar jogo e pontuações?")){
    socket.emit("reset");
  }
};

$("visibility").onchange=e=>{
  socket.emit("set_visibility",e.target.value);
};

$("mygps").onclick=()=>{
  navigator.geolocation.getCurrentPosition(
    p=>{
      $("lat").value=p.coords.latitude.toFixed(6);
      $("lon").value=p.coords.longitude.toFixed(6);

      map.setView(
        [p.coords.latitude,p.coords.longitude],
        18
      );

      if(gpsMarker){
        gpsMarker.setLatLng([
          p.coords.latitude,
          p.coords.longitude
        ]);
      }else{
        gpsMarker=L.marker([
          p.coords.latitude,
          p.coords.longitude
        ])
        .addTo(map)
        .bindPopup("GPS do Game Master");
      }
    },
    e=>alert("GPS: "+e.message),
    {
      enableHighAccuracy:true,
      timeout:15000,
      maximumAge:0
    }
  );
};

$("add").onclick=async()=>{
  const name=$("name").value.trim();
  const qr=$("qr").value.trim();
  const lat=Number($("lat").value);
  const lon=Number($("lon").value);

  if(
    !name ||
    !qr ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ){
    return alert("Preenche nome, QR e coordenadas.");
  }

  const photo=await compress(
    $("photo").files[0]
  );

  send(
    "add_object",
    {
      name,
      desc:$("desc").value,
      team:$("team").value,
      points:$("points").value,
      radius:$("radius").value,
      qr,
      lat,
      lon,
      photo
    },
    r=>{
      if(!r.ok){
        alert(r.error);
      }else{
        $("name").value="";
        $("desc").value="";
        $("qr").value="";
        $("photo").value="";
      }
    }
  );
};

window.delObj=id=>{
  socket.emit(
    "delete_object",
    id,
    r=>{
      if(r && !r.ok){
        alert(r.error);
      }
    }
  );
};

socket.on("state",s=>{
  state=s;
  render();
});
```
