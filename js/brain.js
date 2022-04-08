import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import {OrbitControls} from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls";
import { ImprovedNoise } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/math/ImprovedNoise';

import { Line2 } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/lines/Line2";
import { LineMaterial } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/lines/LineMaterial";
import { LineGeometry } from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/lines/LineGeometry";

import { EffectComposer } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const perlin = new ImprovedNoise();
let v3 = new THREE.Vector3();

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 5000);
camera.position.set(5, 2, 5).setLength(12);
let renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  m.resolution.set(innerWidth, innerHeight);
  bloomPass.resolution.set(innerWidth, innerHeight);
})

let controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 1;
controls.maxDistance = 15;

// <CURVE>

let curvePts = new Array(200).fill().map(p => {
  return new THREE.Vector3().randomDirection();
})
let curve = new THREE.CatmullRomCurve3(curvePts, true);

let pts = curve.getSpacedPoints(200);
pts.shift();
curve = new THREE.CatmullRomCurve3(pts, true);
pts = curve.getSpacedPoints(10000);
pts.forEach(p => {p.setLength(4)});

let n = new THREE.Vector3();
let s = new THREE.Vector3(0.5, 0.5, 1.);
pts.forEach(p => {
  deform(p);
})

let fPts = [];
pts.forEach(p => {fPts.push(p.x, p.y, p.z)});

let g = new LineGeometry();
g.setPositions(fPts);
let globalUniforms = {
  time: {value: 0},
  bloom: {value: 0}
}
let m = new LineMaterial({ 
  color: "magenta", 
  worldUnits: true, 
  linewidth: 0.0375, 
  alphaToCoverage: true,
  onBeforeCompile: shader => {
    shader.uniforms.time = globalUniforms.time;
    shader.uniforms.bloom = globalUniforms.bloom;
    shader.vertexShader = flVert;
    shader.fragmentShader = flFrag;
  }            
});
m.resolution.set(innerWidth, innerHeight);
let l = new Line2(g, m);
l.computeLineDistances();
scene.add(l);
// </CURVE>

// <SPHERE>
let sg = new THREE.IcosahedronGeometry(1, 70);
for(let i = 0; i < sg.attributes.position.count; i++){
  v3.fromBufferAttribute(sg.attributes.position, i);
  deform(v3);
  sg.attributes.position.setXYZ(i, v3.x, v3.y, v3.z);
}
let sm = new THREE.MeshBasicMaterial({
  color: 0x7f00ff, 
  wireframe: true,
  transparent: true,
  onBeforeCompile: shader => {
    shader.uniforms.bloom = globalUniforms.bloom;
    shader.uniforms.time = globalUniforms.time;
    shader.vertexShader = `
      varying vec3 vN;
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
        vN = normal;
      `
    );
    //console.log(shader.vertexShader);
    shader.fragmentShader = `
      uniform float bloom;
      uniform float time;
      varying vec3 vN;
      ${noiseV3}
      ${shader.fragmentShader}
    `.replace(
      `#include <dithering_fragment>`,
      `#include <dithering_fragment>
        float ns = snoise(vec4(vN * 1.5, time * 0.5));
        ns = abs(ns);
        
        vec3 col = mix(diffuse, vec3(0, 1, 1) * 0.5, ns);
        
        gl_FragColor.rgb = mix(col, vec3(0), bloom);
        gl_FragColor.a = ns;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, col, pow(ns, 16.));
      `
    );
}});
let sphere = new THREE.Mesh(sg, sm);
scene.add(sphere);
// </SPHERE>

// <LINKS>
let LINK_COUNT = 50;
let linkPts = [];
for(let i = 0; i < LINK_COUNT; i++){
  let pS = new THREE.Vector3().randomDirection();
  let pE = new THREE.Vector3().randomDirection();
  let division = 100;
  for(let j = 0; j < division; j++){
    let v1 = new THREE.Vector3().lerpVectors(pS, pE, j / division);
    let v2 = new THREE.Vector3().lerpVectors(pS, pE, (j + 1) / division);
    deform(v1, true);
    deform(v2, true);
    linkPts.push(v1, v2);
  }
}
let linkG = new THREE.BufferGeometry().setFromPoints(linkPts);
let linkM = new THREE.LineDashedMaterial({
  color: 0xffff00,
  onBeforeCompile: shader => {
    shader.uniforms.time = globalUniforms.time;
    shader.uniforms.bloom = globalUniforms.bloom;
    shader.fragmentShader = `
      uniform float bloom;
      uniform float time;
      ${shader.fragmentShader}
    `.replace(
      `if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}`,
      ``
    )
     .replace(
      `#include <premultiplied_alpha_fragment>`,
      `#include <premultiplied_alpha_fragment>
        vec3 col = diffuse;
        gl_FragColor.rgb = mix(col * 0.5, vec3(0), bloom);
        
        float sig = sin((vLineDistance * 2. + time * 5.) * 0.5) * 0.5 + 0.5;
        sig = pow(sig, 16.);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, col * 0.75, sig);
      `
    );
    //console.log(shader.fragmentShader);
  }
});
let link = new THREE.LineSegments(linkG, linkM);
link.computeLineDistances();
scene.add(link);
// </LINKS>

// <BACKGROUND>
let bg = new THREE.SphereGeometry(1000, 64, 32);
let bm = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    bloom: globalUniforms.bloom,
    time: globalUniforms.time
  },
  vertexShader:`
    varying vec3 vNormal;
    void main() {
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader:`
    uniform float bloom;
    uniform float time;
    varying vec3 vNormal;
    ${noiseV3}
    void main() {
      vec3 col = vec3(0.012, 0, 0.1);
      float ns = snoise(vec4(vNormal, time * 0.1));
      col = mix(col * 5., col, pow(abs(ns), 0.125));
      col = mix(col, vec3(0), bloom);
      gl_FragColor = vec4( col, 1.0 );
    }
  `
});
let bo = new THREE.Mesh(bg, bm);
scene.add(bo);
// </BACKGROUND>

// <BLOOM>
const params = {
  exposure: 1,
  bloomStrength: 7,
  bloomThreshold: 0,
  bloomRadius: 0
};
const renderScene = new RenderPass( scene, camera );

const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
bloomPass.threshold = params.bloomThreshold;
bloomPass.strength = params.bloomStrength;
bloomPass.radius = params.bloomRadius;

const bloomComposer = new EffectComposer( renderer );
bloomComposer.renderToScreen = false;
bloomComposer.addPass( renderScene );
bloomComposer.addPass( bloomPass );

const finalPass = new ShaderPass(
  new THREE.ShaderMaterial( {
    uniforms: {
      baseTexture: { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture }
    },
    vertexShader: document.getElementById( 'vertexshader' ).textContent,
    fragmentShader: document.getElementById( 'fragmentshader' ).textContent,
    defines: {}
  } ), 'baseTexture'
);
finalPass.needsSwap = true;

const finalComposer = new EffectComposer( renderer );
finalComposer.addPass( renderScene );
finalComposer.addPass( finalPass );
// </BLOOM>

let clock = new THREE.Clock();

info.style.visibility = "hidden";
writing.style.visibility = "visible";

renderer.setAnimationLoop(() => {
  let t = clock.getElapsedTime();
  
  controls.update();
  
  globalUniforms.time.value = t;
  globalUniforms.bloom.value = 1;
  //renderer.setClearColor(0x000000);
  bloomComposer.render();
  globalUniforms.bloom.value = 0;
  //renderer.setClearColor(0x080032);
  finalComposer.render();
  //renderer.render(scene, camera);
})

function deform(p, useLength){
	let mainR = 5;

	v3.copy(p).normalize();
  let len = p.length();
  
  let ns = perlin.noise(v3.x * 3, v3.y * 3, v3.z * 3);
  ns = Math.pow(Math.abs(ns), 0.5) * 0.25;
  
  let r = smoothstep(0.375, 0,Math.abs(v3.x)) - ns;
  p.setLength(mainR - r*1);
  p.y *= 1 - 0.5 * smoothstep(0, -mainR, p.y);
  p.y *= 0.75;
  p.x *= 0.75;
  p.y *= 1 - 0.125 * smoothstep(mainR * 0.25, -mainR, p.z);
  p.x *= 1 - 0.125 * smoothstep(mainR * 0.25, -mainR, p.z);
  if(useLength) {
    p.multiplyScalar(len)
  };
  //p.y += 0.5;
}

//https://github.com/gre/smoothstep/blob/master/index.js
function smoothstep (min, max, value) {
  var x = Math.max(0, Math.min(1, (value-min)/(max-min)));
  return x*x*(3 - 2*x);
};