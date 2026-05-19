import { React } from "@webpack/common";

import { debugLog } from "../store";

const VERTEX_SRC = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Shadertoy-style fragment shaders. Each uses u_time (seconds) + u_resolution (px).

const AURORA = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float t = u_time * 0.08;

    float n1 = snoise(uv * vec2(1.5, 4.0) + vec2(t * 0.3, t * 0.8));
    float n2 = snoise(uv * vec2(3.0, 2.0) - vec2(t * 0.5, t * 0.2));
    float n = (n1 * 0.6 + n2 * 0.4) * 0.5 + 0.5;

    vec3 c1 = vec3(0.02, 0.01, 0.05);
    vec3 c2 = vec3(0.10, 0.0, 0.25);
    vec3 c3 = vec3(0.30, 0.05, 0.55);
    vec3 c4 = vec3(0.0, 0.22, 0.40);

    vec3 color = mix(c1, c2, smoothstep(0.2, 0.5, n));
    color = mix(color, c3, smoothstep(0.5, 0.75, n));
    color = mix(color, c4, smoothstep(0.75, 0.95, n) * 0.7);

    float vfade = smoothstep(0.0, 0.25, uv.y) * (1.0 - smoothstep(0.75, 1.0, uv.y));
    color *= 0.55 + 0.45 * vfade;

    gl_FragColor = vec4(color, 1.0);
}
`;

const PLASMA = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy - 0.5) * 2.0;
    float t = u_time * 0.4;

    float v = sin(uv.x * 5.0 + t);
    v += sin(uv.y * 5.0 + t * 0.7);
    v += sin((uv.x + uv.y) * 4.0 + t * 1.2);
    v += sin(length(uv * 1.5) * 6.0 - t);
    v *= 0.25;

    vec3 color = vec3(
        sin(v * 3.14159 + 0.0) * 0.5 + 0.5,
        sin(v * 3.14159 + 2.094) * 0.5 + 0.5,
        sin(v * 3.14159 + 4.189) * 0.5 + 0.5
    );
    color *= 0.28;

    gl_FragColor = vec4(color, 1.0);
}
`;

const STARS = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    uv.y += u_time * 0.015;

    vec3 color = vec3(0.0);

    for (int i = 0; i < 3; i++) {
        float scale = pow(2.0, float(i));
        vec2 grid = uv * scale * 35.0;
        vec2 cell = floor(grid);
        vec2 cellUV = fract(grid);

        float h = hash(cell);
        if (h > 0.965) {
            vec2 center = vec2(0.5);
            float d = distance(cellUV, center);
            float twinkle = 0.5 + 0.5 * sin(u_time * 2.0 + h * 100.0);
            float brightness = (1.0 - smoothstep(0.0, 0.08, d)) * twinkle / scale;
            color += vec3(0.7, 0.8, 1.0) * brightness * 1.0;
        }
    }

    vec3 bg = mix(vec3(0.0, 0.0, 0.06), vec3(0.03, 0.0, 0.10), gl_FragCoord.y / u_resolution.y);
    gl_FragColor = vec4(bg + color, 1.0);
}
`;

const LIQUID = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float t = u_time * 0.12;

    float n = 0.0;
    float amp = 0.5;
    vec2 p = uv * 3.0;
    vec2 shift = vec2(t * 0.5, t * 0.3);

    for (int i = 0; i < 4; i++) {
        n += amp * noise(p + shift);
        p *= 2.0;
        shift *= 1.5;
        amp *= 0.5;
    }

    vec3 c1 = vec3(0.0, 0.05, 0.12);
    vec3 c2 = vec3(0.05, 0.10, 0.28);
    vec3 c3 = vec3(0.22, 0.05, 0.42);

    vec3 color = mix(c1, c2, smoothstep(0.2, 0.6, n));
    color = mix(color, c3, smoothstep(0.6, 0.9, n) * 0.8);

    gl_FragColor = vec4(color, 1.0);
}
`;

const FLOW = `
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float t = u_time * 0.2;

    vec2 q = uv;
    q.x += 0.3 * noise(uv * 3.0 + vec2(t, 0.0));
    q.y += 0.3 * noise(uv * 3.0 + vec2(0.0, t * 1.3));

    float n = noise(q * 4.0 + t * 0.4);

    vec3 c1 = vec3(0.01, 0.02, 0.06);
    vec3 c2 = vec3(0.15, 0.04, 0.32);
    vec3 c3 = vec3(0.45, 0.15, 0.55);
    vec3 c4 = vec3(0.0, 0.35, 0.50);

    vec3 color = mix(c1, c2, smoothstep(0.25, 0.5, n));
    color = mix(color, c3, smoothstep(0.5, 0.75, n));
    color = mix(color, c4, smoothstep(0.75, 0.95, n) * 0.6);
    color *= 0.85;

    gl_FragColor = vec4(color, 1.0);
}
`;

export const SHADER_PRESETS: Record<string, string> = {
    aurora: AURORA,
    plasma: PLASMA,
    stars: STARS,
    liquid: LIQUID,
    flow: FLOW,
};

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        debugLog("shader compile error", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}

function linkProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        debugLog("program link error", gl.getProgramInfoLog(p));
        gl.deleteProgram(p);
        return null;
    }
    return p;
}

interface ShaderBackgroundProps {
    preset: string;
    opacity?: number;
}

export function ShaderBackground({ preset, opacity = 1 }: ShaderBackgroundProps) {
    const ref: any = React.useRef(null);

    React.useEffect(() => {
        const canvas: HTMLCanvasElement | null = ref.current;
        if (!canvas) return;

        const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false })
            || canvas.getContext("experimental-webgl");
        if (!gl) {
            debugLog("WebGL unavailable; skipping shader");
            return;
        }
        const glContext = gl as WebGLRenderingContext;

        const fragSrc = SHADER_PRESETS[preset] ?? AURORA;

        const vs = compileShader(glContext, glContext.VERTEX_SHADER, VERTEX_SRC);
        const fs = compileShader(glContext, glContext.FRAGMENT_SHADER, fragSrc);
        if (!vs || !fs) return;

        const program = linkProgram(glContext, vs, fs);
        if (!program) return;

        glContext.useProgram(program);

        const posLoc = glContext.getAttribLocation(program, "a_position");
        const timeLoc = glContext.getUniformLocation(program, "u_time");
        const resLoc = glContext.getUniformLocation(program, "u_resolution");

        const buf = glContext.createBuffer();
        glContext.bindBuffer(glContext.ARRAY_BUFFER, buf);
        glContext.bufferData(
            glContext.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            glContext.STATIC_DRAW,
        );
        glContext.enableVertexAttribArray(posLoc);
        glContext.vertexAttribPointer(posLoc, 2, glContext.FLOAT, false, 0, 0);

        const start = performance.now();
        let raf = 0;
        let running = true;

        const render = () => {
            if (!running) return;
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                glContext.viewport(0, 0, w, h);
            }
            const t = (performance.now() - start) / 1000;
            glContext.uniform1f(timeLoc, t);
            glContext.uniform2f(resLoc, w, h);
            glContext.drawArrays(glContext.TRIANGLES, 0, 6);
            raf = requestAnimationFrame(render);
        };
        render();

        return () => {
            running = false;
            cancelAnimationFrame(raf);
            try {
                glContext.deleteProgram(program);
                glContext.deleteShader(vs);
                glContext.deleteShader(fs);
                glContext.deleteBuffer(buf);
            } catch {
                // ignore cleanup errors
            }
        };
    }, [preset]);

    return (
        <canvas
            ref={ref}
            className="vc-cp-shader-canvas"
            style={{ opacity }}
        />
    );
}
