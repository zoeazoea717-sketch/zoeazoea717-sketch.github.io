window.createTerrainRenderer = function createTerrainRenderer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, depth: false, antialias: true });
  if (!gl) return null;

  const program = gl.createProgram();
  const vertex = `#version 300 es
    layout(location=0) in vec4 top;
    layout(location=1) in vec4 bottom;
    layout(location=2) in vec4 tile;
    layout(location=3) in vec2 ink;
    uniform vec2 size;
    out vec2 uv;
    flat out vec2 light;
    void main() {
      vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
      vec2 point = mix(mix(top.xy, top.zw, corner.x), mix(bottom.xy, bottom.zw, corner.x), corner.y);
      gl_Position = vec4(point / size * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
      uv = tile.xy + corner * tile.zw;
      light = ink;
    }`;
  const fragment = `#version 300 es
    precision highp float;
    uniform sampler2D atlas;
    in vec2 uv;
    flat in vec2 light;
    out vec4 color;
    void main() {
      float alpha = texture(atlas, uv).a * light.y;
      color = vec4(vec3(light.x * alpha), alpha);
    }`;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const size = gl.getUniformLocation(program, 'size');
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = 14;
  const bytes = Float32Array.BYTES_PER_ELEMENT;
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, i === 3 ? 2 : 4, gl.FLOAT, false, stride * bytes, i * 4 * bytes);
    gl.vertexAttribDivisor(i, 1);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let data, used = 0;
  let solidU, solidV;
  let available = true;
  canvas.addEventListener('webglcontextlost', () => { available = false; });

  function quad(x0, y0, x1, y1, x2, y2, x3, y3, u, v, du, dv, value, opacity) {
    data[used++] = x0;
    data[used++] = y0;
    data[used++] = x1;
    data[used++] = y1;
    data[used++] = x2;
    data[used++] = y2;
    data[used++] = x3;
    data[used++] = y3;
    data[used++] = u;
    data[used++] = v;
    data[used++] = du;
    data[used++] = dv;
    data[used++] = value;
    data[used++] = opacity;
  }

  return {
    get available() { return available && !gl.isContextLost(); },
    resize(w, h, scale, rows) {
      const sprites = [...new Set(rows.map(row => row.sprite))];
      const atlas = document.createElement('canvas');
      const gutter = 2;
      atlas.width = Math.max(1, ...sprites.map(sprite => sprite.canvas.width + gutter * 2));
      atlas.height = 4 + sprites.reduce((height, sprite) => height + sprite.tile + gutter * 2, 0);
      const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (Math.max(atlas.width, atlas.height) > textureLimit) return false;
      const mask = atlas.getContext('2d');
      mask.fillStyle = '#fff';
      mask.fillRect(0, 0, 3, 3);
      solidU = 1.5 / atlas.width;
      solidV = 1.5 / atlas.height;
      let y = 4;
      for (const sprite of sprites) {
        mask.drawImage(sprite.canvas, gutter, y + gutter);
        sprite.uv = [gutter / atlas.width, (y + gutter) / atlas.height, sprite.tile / atlas.width, sprite.tile / atlas.height];
        y += sprite.tile + gutter * 2;
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      const capacity = rows.reduce((total, row) => total + (row.points.length - 1) * 4, 0);
      data = new Float32Array(capacity * stride);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.STREAM_DRAW);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(size, w, h);
      return true;
    },
    begin() { used = 0; },
    slope(a, b, bottom) {
      quad(a.x, a.y, b.x, b.y, a.x, bottom, b.x, bottom, solidU, solidV, 0, 0, 2 / 255, 1);
    },
    trace(a, b, opacity) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const half = .375 / Math.sqrt(dx * dx + dy * dy);
      const x = dy * half, y = -dx * half;
      quad(a.x+x, a.y+y, b.x+x, b.y+y, a.x-x, a.y-y, b.x-x, b.y-y, solidU, solidV, 0, 0, 1, opacity);
    },
    glyph(sprite, index, x, y, opacity) {
      const [u, v, du, dv] = sprite.uv;
      const span = sprite.span;
      quad(x, y, x+span, y, x, y+span, x+span, y+span, u+index*du, v, du, dv, 1, opacity);
    },
    draw(target, w, h) {
      if (!used) return;
      // Submit in painter's order so each slope covers the glyphs behind it.
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, used);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, used / stride);
      target.drawImage(canvas, 0, 0, w, h);
    }
  };
};
