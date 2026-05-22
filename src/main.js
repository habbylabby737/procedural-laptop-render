const canvas = document.querySelector("#render-canvas");
const gl = canvas.getContext("webgl2", {
  antialias: true,
  alpha: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: true,
});

if (!gl) {
  const fallback = document.createElement("p");
  fallback.className = "fallback";
  fallback.textContent = "WebGL 2 is required to view the render.";
  document.querySelector(".stage").append(fallback);
  throw new Error("WebGL 2 is unavailable.");
}

const vertexSource = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;

uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPos = world.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vUv = aUv;
  gl_Position = uViewProj * world;
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;

uniform vec3 uBaseColor;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform float uRoughness;
uniform float uMetallic;
uniform float uAlpha;
uniform bool uUseTexture;
uniform sampler2D uTexture;
uniform float uEmissive;

out vec4 fragColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDir);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 halfDir = normalize(lightDir + viewDir);

  float ndl = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  float specPower = mix(78.0, 18.0, clamp(uRoughness, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfDir), 0.0), specPower) * mix(0.55, 1.05, uMetallic);
  float groundBounce = clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 tex = uUseTexture ? texture(uTexture, vUv).rgb : vec3(1.0);
  vec3 color = uBaseColor * tex;
  vec3 lit = color * (0.27 + ndl * 0.74 + groundBounce * 0.18);
  lit += vec3(1.0, 0.92, 0.78) * spec;
  lit += vec3(0.45, 0.68, 0.86) * fresnel * 0.18;
  lit = mix(lit, color * 1.18, clamp(uEmissive, 0.0, 1.0));

  fragColor = vec4(pow(lit, vec3(0.4545)), uAlpha);
}
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram() {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

const program = createProgram();
const uniforms = {
  model: gl.getUniformLocation(program, "uModel"),
  viewProj: gl.getUniformLocation(program, "uViewProj"),
  normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
  baseColor: gl.getUniformLocation(program, "uBaseColor"),
  cameraPos: gl.getUniformLocation(program, "uCameraPos"),
  lightDir: gl.getUniformLocation(program, "uLightDir"),
  roughness: gl.getUniformLocation(program, "uRoughness"),
  metallic: gl.getUniformLocation(program, "uMetallic"),
  alpha: gl.getUniformLocation(program, "uAlpha"),
  useTexture: gl.getUniformLocation(program, "uUseTexture"),
  texture: gl.getUniformLocation(program, "uTexture"),
  emissive: gl.getUniformLocation(program, "uEmissive"),
};

const Mat4 = {
  identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },
  multiply(a, b) {
    const out = new Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[i * 4 + j] =
          a[i * 4 + 0] * b[j + 0] +
          a[i * 4 + 1] * b[j + 4] +
          a[i * 4 + 2] * b[j + 8] +
          a[i * 4 + 3] * b[j + 12];
      }
    }
    return out;
  },
  translate(x, y, z) {
    return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
  },
  scale(x, y, z) {
    return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
  },
  rotateX(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
  },
  rotateY(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
  },
  rotateZ(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) * nf,
      2 * far * near * nf,
      0,
      0,
      -1,
      0,
    ];
  },
  lookAt(eye, target, up) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return [
      x[0],
      x[1],
      x[2],
      -dot(x, eye),
      y[0],
      y[1],
      y[2],
      -dot(y, eye),
      z[0],
      z[1],
      z[2],
      -dot(z, eye),
      0,
      0,
      0,
      1,
    ];
  },
};

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function transposeForWebGL(m) {
  return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
}

function normalMatrixFrom(model) {
  return [
    model[0],
    model[1],
    model[2],
    model[4],
    model[5],
    model[6],
    model[8],
    model[9],
    model[10],
  ];
}

function compose(...matrices) {
  return matrices.reduce((acc, matrix) => Mat4.multiply(acc, matrix), Mat4.identity());
}

function createMesh(vertices, indices) {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const stride = 8 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
  gl.bindVertexArray(null);

  return { vao, indexCount: indices.length };
}

function boxGeometry() {
  const v = [];
  const i = [];
  const faces = [
    [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
    [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
    [[0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
    [[0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]],
    [[1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]],
    [[-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]],
  ];

  for (const [normal, points] of faces) {
    const start = v.length / 8;
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let n = 0; n < 4; n++) {
      v.push(...points[n], ...normal, ...uvs[n]);
    }
    i.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return createMesh(v, i);
}

function planeGeometry() {
  return createMesh(
    [
      -0.5, -0.5, 0, 0, 0, 1, 0, 0,
      0.5, -0.5, 0, 0, 0, 1, 1, 0,
      0.5, 0.5, 0, 0, 0, 1, 1, 1,
      -0.5, 0.5, 0, 0, 0, 1, 0, 1,
    ],
    [0, 1, 2, 0, 2, 3],
  );
}

function cylinderGeometry(segments = 32) {
  const vertices = [];
  const indices = [];
  for (let s = 0; s <= segments; s++) {
    const t = (s / segments) * Math.PI * 2;
    const y = Math.cos(t) * 0.5;
    const z = Math.sin(t) * 0.5;
    vertices.push(-0.5, y, z, 0, y * 2, z * 2, s / segments, 0);
    vertices.push(0.5, y, z, 0, y * 2, z * 2, s / segments, 1);
  }
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  return createMesh(vertices, indices);
}

const meshes = {
  box: boxGeometry(),
  plane: planeGeometry(),
  cylinder: cylinderGeometry(40),
};

function textureFromCanvas(canvas2d) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createScreenTexture() {
  const c = document.createElement("canvas");
  c.width = 1400;
  c.height = 900;
  const ctx = c.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, c.width, c.height);
  bg.addColorStop(0, "#6d7686");
  bg.addColorStop(0.45, "#a7a9ae");
  bg.addColorStop(1, "#526b84");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.globalAlpha = 0.92;
  drawSoftArc(ctx, 1030, 190, 660, 92, "#0f559b", 0.88);
  drawSoftArc(ctx, 840, 730, 590, 80, "#7ba55a", 0.55);
  drawSoftArc(ctx, 300, 830, 420, 66, "#6b9b48", 0.35);
  drawSoftArc(ctx, 280, 130, 540, 70, "#1e6aa8", 0.35);
  ctx.globalAlpha = 1;

  const glass = ctx.createRadialGradient(650, 430, 80, 650, 430, 760);
  glass.addColorStop(0, "rgba(255,255,255,0.10)");
  glass.addColorStop(1, "rgba(0,0,0,0.20)");
  ctx.fillStyle = glass;
  ctx.fillRect(0, 0, c.width, c.height);

  const avatarX = c.width / 2;
  const avatarY = c.height * 0.46;
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  drawGlobe(ctx, avatarX - 8, avatarY - 54, 50);
  drawCodexBadge(ctx, avatarX + 42, avatarY - 16, 34);
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.font = "700 34px -apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Codex is Using Your Mac", avatarX, avatarY + 54);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = "650 24px -apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif";
  ctx.fillText("Press any key or click to unlock", avatarX, avatarY + 112);

  return textureFromCanvas(c);
}

function createRoomTexture() {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 900;
  const ctx = c.getContext("2d");
  let seed = 28123;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const wall = ctx.createLinearGradient(0, 0, c.width, c.height);
  wall.addColorStop(0, "#485044");
  wall.addColorStop(0.46, "#d3d2bf");
  wall.addColorStop(1, "#c0baa3");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.save();
  ctx.filter = "blur(24px)";
  ctx.globalAlpha = 0.78;
  for (let i = 0; i < 42; i++) {
    const x = 90 + rand() * 360;
    const y = 80 + rand() * 650;
    const r = 18 + rand() * 72;
    const hue = 80 + rand() * 55;
    ctx.fillStyle = `hsla(${hue}, 48%, ${42 + rand() * 28}%, ${0.18 + rand() * 0.26})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = "#f2edcf";
  roundRect(ctx, 900, 0, 500, 610, 20);
  ctx.fill();
  ctx.fillStyle = "#9aa28f";
  ctx.fillRect(1075, 0, 7, 620);
  ctx.fillRect(1290, 0, 7, 620);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#a97442";
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 620, c.width, 280);
  ctx.globalAlpha = 0.20;
  for (let y = 630; y < c.height; y += 24) {
    ctx.fillRect(0, y, c.width, 3);
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(c.width * 0.50, c.height * 0.46, 120, c.width * 0.50, c.height * 0.46, 900);
  vignette.addColorStop(0, "rgba(255,255,255,0.12)");
  vignette.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, c.width, c.height);

  return textureFromCanvas(c);
}

function drawSoftArc(ctx, x, y, radius, width, color, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.filter = "blur(30px)";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0.18 * Math.PI, 1.42 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawGlobe(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.1, x, y, r);
  g.addColorStop(0, "#89a7d7");
  g.addColorStop(0.45, "#174792");
  g.addColorStop(1, "#081b42");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(74,141,64,0.84)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.30, y + r * 0.05, r * 0.22, r * 0.30, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.28, y - r * 0.12, r * 0.18, r * 0.25, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.arc(x - r * 0.26, y - r * 0.42, r * 0.20, 0, Math.PI * 2);
  ctx.fill();
}

function drawCodexBadge(ctx, x, y, size) {
  const r = size * 0.22;
  const g = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
  g.addColorStop(0, "#7ed7ff");
  g.addColorStop(0.48, "#b7a8ff");
  g.addColorStop(1, "#ff8db5");
  ctx.fillStyle = g;
  roundRect(ctx, x - size / 2, y - size / 2, size, size, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.48);
  ctx.strokeStyle = "rgba(255,255,255,0.70)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.24, -1.2, 1.8);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const whiteTexture = (() => {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  return textureFromCanvas(c);
})();

const screenTexture = createScreenTexture();
const roomTexture = createRoomTexture();
const objects = [];

function add(mesh, model, material) {
  objects.push({ mesh, model, material });
}

const materials = {
  screen: { color: [1, 1, 1], roughness: 0.42, metallic: 0, alpha: 1, emissive: 0.72, texture: screenTexture },
  room: { color: [1, 1, 1], roughness: 0.78, metallic: 0, alpha: 1, emissive: 0.34, texture: roomTexture },
  black: { color: [0.010, 0.011, 0.014], roughness: 0.46, metallic: 0.30, alpha: 1 },
  dark: { color: [0.018, 0.020, 0.025], roughness: 0.68, metallic: 0.18, alpha: 1 },
  metal: { color: [0.57, 0.58, 0.53], roughness: 0.27, metallic: 0.78, alpha: 1 },
  key: { color: [0.022, 0.024, 0.030], roughness: 0.78, metallic: 0.06, alpha: 1 },
  desk: { color: [0.68, 0.50, 0.30], roughness: 0.64, metallic: 0, alpha: 1 },
  glass: { color: [0.78, 0.92, 0.86], roughness: 0.04, metallic: 0, alpha: 0.33 },
  screenGlass: { color: [0.72, 0.88, 1.0], roughness: 0.08, metallic: 0, alpha: 0.16, emissive: 0.18 },
  reflection: { color: [0.72, 0.82, 0.92], roughness: 0.80, metallic: 0, alpha: 0.18, emissive: 0.24, texture: screenTexture },
  paper: { color: [0.88, 0.85, 0.73], roughness: 0.72, metallic: 0, alpha: 1 },
  pen: { color: [0.025, 0.026, 0.040], roughness: 0.35, metallic: 0.35, alpha: 1 },
};

function buildScene() {
  objects.length = 0;

  add(meshes.plane, compose(Mat4.translate(0, 1.15, -2.45), Mat4.scale(10.5, 5.7, 1)), materials.room);
  add(meshes.box, compose(Mat4.translate(0, -0.70, 0), Mat4.scale(7.6, 0.055, 4.0)), materials.desk);
  add(meshes.box, compose(Mat4.translate(0, 1.48, -0.55), Mat4.rotateX(-0.10), Mat4.scale(5.9, 3.25, 0.12)), materials.black);
  add(meshes.plane, compose(Mat4.translate(0, 1.48, -0.475), Mat4.rotateX(-0.10), Mat4.scale(5.25, 2.78, 1)), materials.screen);
  add(meshes.plane, compose(Mat4.translate(0, 1.49, -0.445), Mat4.rotateX(-0.10), Mat4.scale(5.32, 2.84, 1)), materials.screenGlass);

  add(meshes.box, compose(Mat4.translate(0, 3.03, -0.30), Mat4.rotateX(-0.10), Mat4.scale(0.50, 0.13, 0.12)), materials.black);
  add(meshes.box, compose(Mat4.translate(0, -0.12, 0.70), Mat4.scale(6.35, 0.14, 2.45)), materials.metal);
  add(meshes.plane, compose(Mat4.translate(0, -0.045, 0.62), Mat4.rotateX(-Math.PI / 2), Mat4.scale(3.25, 1.58, 1)), materials.reflection);
  add(meshes.box, compose(Mat4.translate(0, 0.02, -0.49), Mat4.scale(5.55, 0.16, 0.13)), materials.dark);
  add(meshes.cylinder, compose(Mat4.translate(0, 0.05, -0.55), Mat4.scale(5.35, 0.13, 0.13)), materials.black);

  add(meshes.box, compose(Mat4.translate(0, 0.025, 0.62), Mat4.scale(5.45, 0.035, 1.38)), materials.dark);
  for (let row = 0; row < 5; row++) {
    const y = 0.07;
    const z = 0.12 + row * 0.235;
    const offset = row === 1 ? 0.08 : row === 2 ? 0.16 : 0;
    for (let k = 0; k < 13; k++) {
      const x = (k - 6) * 0.39 + offset;
      const width = row === 4 && k > 3 && k < 9 ? 0.54 : 0.30;
      add(meshes.box, compose(Mat4.translate(x, y, z), Mat4.scale(width, 0.050, 0.145)), materials.key);
    }
  }

  add(meshes.box, compose(Mat4.translate(0, 0.075, 1.62), Mat4.scale(1.22, 0.018, 0.36)), {
    color: [0.28, 0.30, 0.29],
    roughness: 0.30,
    metallic: 0.42,
    alpha: 1,
  });

  add(meshes.cylinder, compose(Mat4.translate(-3.04, -0.22, -0.82), Mat4.rotateZ(Math.PI / 2), Mat4.scale(0.90, 0.42, 0.42)), materials.glass);
  add(meshes.cylinder, compose(Mat4.translate(-3.04, -0.15, -0.82), Mat4.rotateZ(Math.PI / 2), Mat4.scale(0.88, 0.32, 0.32)), {
    color: [0.60, 0.78, 0.78],
    roughness: 0.12,
    metallic: 0,
    alpha: 0.23,
  });
  add(meshes.box, compose(Mat4.translate(3.00, -0.30, -0.35), Mat4.rotateY(-0.18), Mat4.scale(1.10, 0.12, 0.64)), materials.paper);
  add(meshes.cylinder, compose(Mat4.translate(3.10, -0.05, -0.46), Mat4.rotateY(-0.90), Mat4.rotateZ(-0.18), Mat4.scale(1.12, 0.08, 0.08)), materials.pen);
}

buildScene();

const state = {
  yaw: -0.08,
  pitch: -0.06,
  distance: 7.45,
  velYaw: 0.0,
  velPitch: 0.0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  autoSpin: true,
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  state.dragging = true;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  state.autoSpin = false;
  document.body.classList.remove("is-spinning");
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  const dx = event.clientX - state.lastX;
  const dy = event.clientY - state.lastY;
  state.lastX = event.clientX;
  state.lastY = event.clientY;
  state.velYaw = dx * 0.006;
  state.velPitch = dy * 0.004;
  state.yaw += state.velYaw;
  state.pitch = Math.max(-0.55, Math.min(0.35, state.pitch + state.velPitch));
});

canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.dragging = false;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.distance = Math.max(5.2, Math.min(10.5, state.distance + event.deltaY * 0.006));
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
    state.autoSpin = !state.autoSpin;
    document.body.classList.toggle("is-spinning", state.autoSpin);
    updateControls();
  }
  if (event.key === "ArrowLeft") state.velYaw -= 0.025;
  if (event.key === "ArrowRight") state.velYaw += 0.025;
  if (event.key === "ArrowUp") state.pitch = Math.max(-0.55, state.pitch - 0.055);
  if (event.key === "ArrowDown") state.pitch = Math.min(0.35, state.pitch + 0.055);
});

const spinButton = document.querySelector("[data-action='spin']");
const resetButton = document.querySelector("[data-action='reset']");

function updateControls() {
  if (!spinButton) return;
  spinButton.textContent = state.autoSpin ? "Pause Spin" : "Start Spin";
  spinButton.setAttribute("aria-pressed", String(state.autoSpin));
}

spinButton?.addEventListener("click", () => {
  state.autoSpin = !state.autoSpin;
  document.body.classList.toggle("is-spinning", state.autoSpin);
  updateControls();
});

resetButton?.addEventListener("click", () => {
  state.yaw = -0.08;
  state.pitch = -0.06;
  state.distance = 7.45;
  state.velYaw = 0;
  state.velPitch = 0;
  state.autoSpin = true;
  document.body.classList.add("is-spinning");
  updateControls();
});

document.body.classList.add("is-spinning");
updateControls();

function drawObject(object, viewProj, cameraPos) {
  const material = object.material;
  gl.bindVertexArray(object.mesh.vao);
  gl.uniformMatrix4fv(uniforms.model, false, new Float32Array(transposeForWebGL(object.model)));
  gl.uniformMatrix3fv(uniforms.normalMatrix, false, new Float32Array(normalMatrixFrom(object.model)));
  gl.uniform3fv(uniforms.baseColor, material.color);
  gl.uniform1f(uniforms.roughness, material.roughness);
  gl.uniform1f(uniforms.metallic, material.metallic);
  gl.uniform1f(uniforms.alpha, material.alpha);
  gl.uniform1f(uniforms.emissive, material.emissive || 0);
  gl.uniform1i(uniforms.useTexture, material.texture ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, material.texture || whiteTexture);
  gl.uniform1i(uniforms.texture, 0);
  gl.drawElements(gl.TRIANGLES, object.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
}

function frame(now) {
  resize();
  const t = now * 0.001;
  if (!state.dragging) {
    if (state.autoSpin) {
      state.velYaw = 0.00135;
      state.velPitch *= 0.92;
    }
    state.yaw += state.velYaw;
    state.pitch = Math.max(-0.55, Math.min(0.35, state.pitch + state.velPitch));
    state.velYaw *= state.autoSpin ? 1.0 : 0.940;
    state.velPitch *= 0.92;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.clearColor(0.55, 0.57, 0.49, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = canvas.width / canvas.height;
  const radius = state.distance;
  const cameraPos = [
    Math.sin(state.yaw) * Math.cos(state.pitch) * radius,
    1.25 + Math.sin(state.pitch) * radius,
    Math.cos(state.yaw) * Math.cos(state.pitch) * radius,
  ];
  const view = Mat4.lookAt(cameraPos, [0, 0.88, 0.16], [0, 1, 0]);
  const proj = Mat4.perspective(0.68, aspect, 0.1, 80);
  const viewProj = Mat4.multiply(proj, view);

  gl.useProgram(program);
  gl.uniformMatrix4fv(uniforms.viewProj, false, new Float32Array(transposeForWebGL(viewProj)));
  gl.uniform3fv(uniforms.cameraPos, cameraPos);
  gl.uniform3fv(uniforms.lightDir, normalize([-0.42 + Math.sin(t * 0.18) * 0.04, 0.74, 0.52]));

  const opaque = objects.filter((object) => object.material.alpha >= 1);
  const translucent = objects.filter((object) => object.material.alpha < 1);
  gl.disable(gl.BLEND);
  for (const object of opaque) drawObject(object, viewProj, cameraPos);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const object of translucent) drawObject(object, viewProj, cameraPos);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
