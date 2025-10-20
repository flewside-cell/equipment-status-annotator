// src/main.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ---------- URL-параметры ----------
function param(name: string, fallback: string) {
  const u = new URL(window.location.href)
  return u.searchParams.get(name) || fallback
}
const modelURL    = param('model',    `${import.meta.env.BASE_URL}model.glb`)
const statusesURL = param('statuses', `${import.meta.env.BASE_URL}statuses.json`)

// ---------- Сцена ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111317)

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000)
camera.position.set(4, 4, 8)

const dl = new THREE.DirectionalLight(0xffffff, 1.0)
dl.position.set(5, 10, 7)
scene.add(dl, new THREE.AmbientLight(0xffffff, 0.35))

// ---------- Данные статусов ----------
type StatusRec = { name: string; label?: string; status?: string; href?: string }
let legend: Record<string, string> = {}
const statusByName = new Map<string, StatusRec>()

async function loadStatuses() {
  const res = await fetch(statusesURL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Failed to load ${statusesURL}: ${res.status}`)
  const data = await res.json()
  legend = data.legend ?? {}
  statusByName.clear()
  for (const rec of (data.objects ?? [])) {
    if (rec && rec.name) statusByName.set(rec.name, rec)
  }
}

function applyStatusColor(mesh: THREE.Mesh, rec?: StatusRec) {
  if (!rec?.status) return
  const col = legend[rec.status]
  if (!col) return
  const mat = mesh.material as THREE.Material & { color?: THREE.Color }
  if (mat && 'color' in mat && mat.color) {
    mat.color = new THREE.Color(col)
    ;(mat as any).needsUpdate = true
  }
}

function annotate(root: THREE.Object3D) {
  root.traverse(obj => {
    // работаем по мешам
    // @ts-ignore
    if (obj?.isMesh) {
      // гарантируем материал
      // @ts-ignore
      if (!obj.material) obj.material = new THREE.MeshStandardMaterial({ color: 0x9ca3af })
      const rec = statusByName.get(obj.name)
      if (rec) {
        // @ts-ignore
        obj.userData.statusRec = rec
        applyStatusColor(obj as THREE.Mesh, rec)
      }
      // улучшение hit-тестов
      // @ts-ignore
      obj.raycast = THREE.Mesh.prototype.raycast
      // @ts-ignore
      obj.castShadow = obj.receiveShadow = true
    }
  })
}

// ---------- Загрузка ----------
const gltfLoader = new GLTFLoader()

Promise.all([
  loadStatuses(),
  new Promise<THREE.Object3D>((resolve, reject) => {
    gltfLoader.load(modelURL, (gltf) => resolve(gltf.scene), undefined, reject)
  })
]).then(([_, root]) => {
  scene.add(root)
  annotate(root)
  animate()
}).catch(console.error)

// ---------- Рендер ----------
function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}

// ---------- Raycaster ----------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let hovered: THREE.Object3D | null = null

function setPointer(e: PointerEvent) {
  const r = renderer.domElement.getBoundingClientRect()
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
}

function pick() {
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(scene.children, true)
  for (const h of hits) {
    // @ts-ignore
    if (h.object?.isMesh) return h.object
  }
  return null
}

renderer.domElement.addEventListener('pointermove', (e) => {
  setPointer(e)
  const hit = pick()
  if (hit !== hovered) {
    hovered = hit
    // @ts-ignore
    const href = hovered?.userData?.statusRec?.href
    renderer.domElement.style.cursor = href ? 'pointer' : 'default'
  }
})

renderer.domElement.addEventListener('click', (e) => {
  setPointer(e)
  const hit = pick()
  // @ts-ignore
  const href: string | undefined = hit?.userData?.statusRec?.href
  if (href) window.open(href, '_blank', 'noopener,noreferrer')
})

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
