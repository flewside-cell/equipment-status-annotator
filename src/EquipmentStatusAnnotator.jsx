import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF, Bounds, useBounds } from "@react-three/drei";
import * as THREE from "three";
import QRCode from "qrcode";

const STATUS_COLORS = { operational:"#16a34a", fault:"#dc2626", maintenance:"#d97706", offline:"#4b5563", unknown:"#6b7280" };

function fileToObjectURL(file){ return file ? URL.createObjectURL(file) : null; }
function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function FollowNode({ target, children }){
  const groupRef = useRef(null);
  useEffect(() => {
    let id; const loop = () => {
      const g = groupRef.current;
      if (g && target) { target.updateWorldMatrix(true, false); g.matrix.copy(target.matrixWorld); g.matrix.decompose(g.position, g.quaternion, g.scale); }
      id = requestAnimationFrame(loop);
    }; id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [target]);
  return <group ref={groupRef}>{children}</group>;
}

function NodeLabel({ node, status, note, alwaysVisible }){
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
  const [hover, setHover] = useState(false);
  return (
    <FollowNode target={node}>
      <Html center transform distanceFactor={8} occlude={!alwaysVisible}>
        <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
             style={{pointerEvents:"auto", background:"rgba(255,255,255,0.82)", border:"1px solid #e5e7eb", borderRadius:14, padding:"8px 12px",
                     minWidth:160, boxShadow:"0 6px 18px rgba(0,0,0,0.08)", backdropFilter:"blur(6px)", fontFamily:"system-ui,Segoe UI,Roboto,Arial,sans-serif"}}>
          <div style={{display:"flex",gap:8,alignItems:"center",justifyContent:"space-between"}}>
            <span title={node.name} style={{fontSize:12,fontWeight:600,color:"#111827",overflow:"hidden",textOverflow:"ellipsis"}}>{node.name || "(unnamed)"}</span>
            <span title={status} style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:999,background:`${color}20`,color}}>{status}</span>
          </div>
          {(note || hover) && <div style={{marginTop:6,fontSize:12,color:"#374151",maxWidth:260}}>{note || "Нет примечаний"}</div>}
        </div>
      </Html>
    </FollowNode>
  );
}

function GLBModel({ url, onSceneReady }){
  const gltf = useGLTF(url, true);
  const ref = useRef();
  useEffect(() => { if (gltf && gltf.scene && onSceneReady) onSceneReady(gltf.scene); }, [gltf, onSceneReady]);
  return <primitive ref={ref} object={gltf.scene} dispose={null} />;
}

function FitToContentButton(){
  const api = useBounds();
  return <button onClick={()=>api.refresh().fit()} title="Подогнать камеру" type="button"
                 style={{padding:"6px 12px",borderRadius:12,border:"1px solid #e5e7eb",background:"white",fontSize:13}}>Fit view</button>;
}

export default function EquipmentStatusAnnotator(){
  const [glbFile, setGlbFile] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);
  const [glbUrl, setGlbUrl] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [search, setSearch] = useState("");
  const [alwaysVisible, setAlwaysVisible] = useState(true);

  const [sceneRoot, setSceneRoot] = useState(null);
  const [nodes, setNodes] = useState([]);

  const [selectedName, setSelectedName] = useState("");
  const [draftStatus, setDraftStatus] = useState("operational");
  const [draftNote, setDraftNote] = useState("");

  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrFileDataUrl, setQrFileDataUrl] = useState(null);
  const [qrAppDataUrl, setQrAppDataUrl] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const m = u.searchParams.get("model");
      const s = u.searchParams.get("statuses");
      if (m) setGlbUrl(m); else setGlbUrl("/equipment-status-annotator/model.glb");
      if (s) fetch(s).then(r=>r.json()).then(setStatuses).catch(()=>{});
      else fetch("/equipment-status-annotator/statuses.json").then(r=>r.ok?r.json():null).then(d=>d&&setStatuses(d)).catch(()=>{});
    } catch {}
  }, []);

  useEffect(() => {
    const url = fileToObjectURL(glbFile);
    if (url) setGlbUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [glbFile]);

  useEffect(() => {
    if (!jsonFile) return;
    const r = new FileReader();
    r.onload = () => { try { setStatuses(JSON.parse(r.result)); } catch (e) { alert("Не удалось прочитать JSON: "+e.message); } };
    r.readAsText(jsonFile);
  }, [jsonFile]);

  const discoverNodes = (root) => {
    if (!root) return [];
    const arr = [];
    root.traverse((o) => {
      const isRenderable = o.isMesh || o.isSkinnedMesh || o.type === "Group";
      if (!isRenderable) return;
      if (!o.name) return;
      arr.push(o);
    });
    return arr;
  };
  useEffect(() => { if (!sceneRoot) { setNodes([]); return; } setNodes(discoverNodes(sceneRoot)); }, [sceneRoot]);

  const labelData = useMemo(() => {
    const map = statuses?.nodes ?? {};
    const def = statuses?.defaults?.status ?? "unknown";
    return nodes.filter(n => (search ? n.name.toLowerCase().includes(search.toLowerCase()) : true))
                .map(n => ({ node:n, status:(map[n.name]?.status ?? def), note: map[n.name]?.note }));
  }, [nodes, statuses, search]);

  const handleExportTemplate = () => {
    const template = { defaults: { status: "unknown" }, nodes: Object.fromEntries(nodes.map(n => [n.name, { status: "unknown", note: "" }])) };
    downloadJSON("statuses-template.json", template);
  };
  const handleExportStatuses = () => {
    const payload = { defaults: { status: statuses?.defaults?.status || "unknown" }, nodes: { ...(statuses?.nodes || {}) } };
    downloadJSON("statuses.json", payload);
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
    let obj = e.object;
    while (obj && !obj.name && obj.parent) obj = obj.parent;
    if (obj && obj.name) setSelectedName(obj.name);
  };
  const applyDraftToStatuses = () => {
    if (!selectedName) { alert("Сначала кликните по объекту в сцене"); return; }
    setStatuses(prev => {
      const base = { defaults: { status: prev?.defaults?.status || "unknown" }, nodes: { ...(prev?.nodes || {}) } };
      base.nodes[selectedName] = { status: draftStatus, note: draftNote };
      return base;
    });
  };

  const generateQrToFile = async () => {
    const isHttp = typeof qrUrl==="string" && (qrUrl.startsWith("http://") || qrUrl.startsWith("https://"));
    if (!isHttp) { alert("Укажи публичный URL (http/https) к .glb"); return; }
    setQrBusy(true);
    try { setQrFileDataUrl(await QRCode.toDataURL(qrUrl, { errorCorrectionLevel:"M", margin:1, scale:8 })); }
    catch(e){ alert("Не удалось сгенерировать QR (файл): " + (e?.message || e)); }
    finally { setQrBusy(false); }
  };
  const generateQrToApp = async () => {
    const isHttp = typeof qrUrl==="string" && (qrUrl.startsWith("http://") || qrUrl.startsWith("https://"));
    if (!isHttp) { alert("Укажи публичный URL (http/https) к .glb"); return; }
    const base = window.location.origin + "/equipment-status-annotator";
    const appUrl = `${base}/?model=${encodeURIComponent(qrUrl)}`;
    setQrBusy(true);
    try { setQrAppDataUrl(await QRCode.toDataURL(appUrl, { errorCorrectionLevel:"M", margin:1, scale:8 })); }
    catch(e){ alert("Не удалось сгенерировать QR (страница): " + (e?.message || e)); }
    finally { setQrBusy(false); }
  };

  return (
    <div style={{ width:"100%", height:"100vh", display:"flex", flexDirection:"column", background:"#f9fafb" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:12, borderBottom:"1px solid #e5e7eb", background:"white" }}>
        <div style={{ fontWeight:600, color:"#111827", fontSize:14 }}>3D Equipment Status Annotator</div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13, color:"#374151" }}>
            <span>GLB:</span><input type="file" accept=".glb" onChange={(e)=>setGlbFile(e.target.files?.[0]||null)} />
          </label>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13, color:"#374151" }}>
            <span>Statuses JSON:</span><input type="file" accept=".json,application/json" onChange={(e)=>setJsonFile(e.target.files?.[0]||null)} />
          </label>
          <button type="button" onClick={handleExportTemplate} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>Export template</button>
          <button type="button" onClick={()=>setQrOpen(v=>!v)} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>QR</button>
        </div>
      </div>

      {qrOpen && (
        <div style={{ padding:12, borderBottom:"1px solid #e5e7eb", background:"white" }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <input type="url" inputMode="url" value={qrUrl} onChange={(e)=>setQrUrl(e.target.value)} placeholder="Публичный URL к .glb (http/https)"
                   style={{ padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, minWidth:360, flex:"1 1 360px" }} />
            <button type="button" onClick={generateQrToFile} disabled={qrBusy} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13, opacity: qrBusy?0.5:1 }}>QR файл (.glb)</button>
            <button type="button" onClick={generateQrToApp} disabled={qrBusy} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13, opacity: qrBusy?0.5:1 }}>QR страница (просмотр)</button>
            {qrFileDataUrl && <a href={qrFileDataUrl} download="model-file-qr.png" style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>Скачать QR-файл</a>}
            {qrAppDataUrl && <a href={qrAppDataUrl} download="viewer-page-qr.png" style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>Скачать QR-страница</a>}
          </div>
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:12, padding:12, borderBottom:"1px solid #e5e7eb", background:"white" }}>
        <input type="text" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Поиск по имени узла..." style={{ padding:"8px 10px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:13, width:260 }} />
        <label style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13, color:"#374151" }}>
          <input type="checkbox" checked={alwaysVisible} onChange={(e)=>setAlwaysVisible(e.target.checked)} /> Показать ярлыки сквозь объекты
        </label>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}><FitToContentButton /></div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:8, padding:12, borderBottom:"1px solid #e5e7eb", background:"white" }}>
        <span style={{ fontSize:13, color:"#374151" }}>Выбрано:</span>
        <input type="text" readOnly value={selectedName} placeholder="кликните по объекту" style={{ padding:"6px 8px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, width:280 }} />
        <select value={draftStatus} onChange={(e)=>setDraftStatus(e.target.value)} style={{ padding:"6px 8px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13 }}>
          <option value="operational">operational</option>
          <option value="fault">fault</option>
          <option value="maintenance">maintenance</option>
          <option value="offline">offline</option>
          <option value="unknown">unknown</option>
        </select>
        <input type="text" value={draftNote} onChange={(e)=>setDraftNote(e.target.value)} placeholder="note (опционально)" style={{ padding:"6px 8px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, width:260 }} />
        <button type="button" onClick={applyDraftToStatuses} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>Привязать статус</button>
        <button type="button" onClick={handleExportStatuses} style={{ padding:"6px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", fontSize:13 }}>Export statuses</button>
      </div>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", padding:12, borderBottom:"1px solid #e5e7eb", background:"white" }}>
        {Object.entries(STATUS_COLORS).map(([k,v]) => (
          <span key={k} style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:12 }}>
            <span style={{ width:12, height:12, borderRadius:999, display:"inline-block", background:v }} />
            <span style={{ color:"#374151" }}>{k}</span>
          </span>
        ))}
      </div>

      <div style={{ flex:1, position:"relative" }}>
        <Canvas camera={{ position:[3,2,4], fov:50 }} dpr={[1,2]} onPointerDown={handlePointerDown}>
          <Suspense fallback={<Html center><div style={{ padding:"8px 12px", borderRadius:12, border:"1px solid #e5e7eb", background:"white", boxShadow:"0 6px 18px rgba(0,0,0,0.08)" }}>Загрузка модели…</div></Html>}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5,10,5]} intensity={0.7} />
            <Bounds fit clip observe margin={1.2}>
              {glbUrl ? <GLBModel url={glbUrl} onSceneReady={setSceneRoot} /> : (
                <Html center><div style={{maxWidth:560,textAlign:"center",background:"rgba(255,255,255,0.9)",border:"1px solid #e5e7eb",borderRadius:14,boxShadow:"0 6px 18px rgba(0,0,0,0.08)",padding:24,backdropFilter:"blur(6px)"}}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#111827", marginBottom:6 }}>Загрузите .glb и JSON</div>
                  <div style={{ fontSize:13, color:"#4b5563" }}>Или используйте параметры URL: <code>?model=&lt;URL_glb&gt;&amp;statuses=&lt;URL_json&gt;</code></div>
                </div></Html>
              )}
              {sceneRoot && labelData.map(({node,status,note}) => <NodeLabel key={node.uuid} node={node} status={status} note={note} alwaysVisible={alwaysVisible} />)}
              <mesh visible={false}><boxGeometry args={[0,0,0]} /><meshBasicMaterial /></mesh>
            </Bounds>
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.2} maxDistance={100} />
          </Suspense>
        </Canvas>
      </div>

      <div style={{ padding:12, borderTop:"1px solid #e5e7eb", background:"white", fontSize:12, color:"#6b7280" }}>
        Примечание: соответствие выполняется по exact-именам узлов. Экспортируйте шаблон, чтобы узнать имена.
      </div>
    </div>
  );
}

useGLTF.preload = (url) => {};
