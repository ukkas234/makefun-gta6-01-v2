// Solmara — render.js
// createWorld3D(canvas): the THREE.js scene, camera, renderer and the day/night
// cycle. Owns lighting, fog, sky colour and window resize. It does NOT own game
// logic: the main loop positions the camera each frame via follow(target, dt),
// which always sits behind and above the target (player on foot or in a car),
// never side-on. Shadows stay OFF (spec); cars and the player get blob shadows
// from their own modules instead.
//
// setTimeOfDay(t): t is the game clock in hours, 0-24. 06:00 is sunrise,
// 12:00 midday, 18:00 sunset, 00:00 midnight.
import * as THREE from '../vendor/three.module.js';

const DAY_SKY = new THREE.Color(0x87b5e0);
const DAWN_SKY = new THREE.Color(0xe8906a);
const DUSK_SKY = new THREE.Color(0xd97a4e);
const NIGHT_SKY = new THREE.Color(0x0a1230);
const DAY_FOG = new THREE.Color(0x9db8cc);
const NIGHT_FOG = new THREE.Color(0x0a1230);

const FOG_NEAR = 90;
const FOG_FAR = 620;

export function createWorld3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false; // spec: shadows OFF, blob shadows instead
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DAY_SKY);
  scene.fog = new THREE.Fog(DAY_FOG.getHex(), FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
  camera.position.set(0, 12, -18);
  camera.lookAt(0, 1, 0);

  // Hemisphere light: sky/ground bounce, always present so night is never pitch black.
  const hemisphere = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.9);
  scene.add(hemisphere);

  // One directional light plays both sun (day) and moon (night): its colour,
  // intensity and position are driven by setTimeOfDay.
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(sun.target);

  // Visible sun and moon discs in the sky, so the time of day reads at a glance.
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(9, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdf80, fog: false }),
  );
  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }),
  );
  moonDisc.visible = false;
  scene.add(sunDisc);
  scene.add(moonDisc);

  let timeOfDay = 12;

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.floor(width * renderer.getPixelRatio())
      || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Blend helper: pick the sky/fog palette for the current hour.
  function skyFor(hour) {
    // Returns { sky, fog, sunI, hemiI, sunColor, dayFactor } with dayFactor 0 at
    // night and 1 at midday.
    if (hour >= 6 && hour < 9) {
      const t = (hour - 6) / 3;
      return {
        sky: new THREE.Color().lerpColors(DAWN_SKY, DAY_SKY, t),
        fog: new THREE.Color().lerpColors(DAWN_SKY, DAY_FOG, t),
        sunI: 0.4 + 1.6 * t, hemiI: 0.35 + 0.55 * t,
        sunColor: new THREE.Color().lerpColors(new THREE.Color(0xffb36b), new THREE.Color(0xfff2d8), t),
        dayFactor: t,
      };
    }
    if (hour >= 9 && hour < 16) {
      return {
        sky: DAY_SKY.clone(), fog: DAY_FOG.clone(),
        sunI: 2.0, hemiI: 0.9, sunColor: new THREE.Color(0xfff2d8), dayFactor: 1,
      };
    }
    if (hour >= 16 && hour < 19) {
      const t = (hour - 16) / 3;
      return {
        sky: new THREE.Color().lerpColors(DAY_SKY, DUSK_SKY, t),
        fog: new THREE.Color().lerpColors(DAY_FOG, DUSK_SKY, t),
        sunI: 2.0 - 1.7 * t, hemiI: 0.9 - 0.55 * t,
        sunColor: new THREE.Color().lerpColors(new THREE.Color(0xfff2d8), new THREE.Color(0xff8a4d), t),
        dayFactor: 1 - t,
      };
    }
    if (hour >= 19 && hour < 21) {
      const t = (hour - 19) / 2;
      return {
        sky: new THREE.Color().lerpColors(DUSK_SKY, NIGHT_SKY, t),
        fog: new THREE.Color().lerpColors(DUSK_SKY, NIGHT_FOG, t),
        sunI: 0.3 - 0.3 * t, hemiI: 0.35 - 0.1 * t,
        sunColor: new THREE.Color(0x8fa8ff), dayFactor: 0,
      };
    }
    if (hour >= 5 && hour < 6) {
      const t = (hour - 5) / 1;
      return {
        sky: new THREE.Color().lerpColors(NIGHT_SKY, DAWN_SKY, t),
        fog: new THREE.Color().lerpColors(NIGHT_FOG, DAWN_SKY, t),
        sunI: 0.4 * t, hemiI: 0.25 + 0.1 * t,
        sunColor: new THREE.Color(0xffb36b), dayFactor: 0,
      };
    }
    return {
      sky: NIGHT_SKY.clone(), fog: NIGHT_FOG.clone(),
      sunI: 0.12, hemiI: 0.25, sunColor: new THREE.Color(0x8fa8ff), dayFactor: 0,
    };
  }

  function setTimeOfDay(t) {
    timeOfDay = ((t % 24) + 24) % 24;
    const hour = timeOfDay;
    const s = skyFor(hour);
    scene.background.copy(s.sky);
    scene.fog.color.copy(s.fog);
    hemisphere.intensity = s.hemiI;
    sun.intensity = Math.max(0.05, s.sunI);
    sun.color.copy(s.sunColor);

    // Sun path: rises east (06:00), noon overhead south, sets west (18:00).
    // At night the same light becomes a dim moon from the opposite side.
    const dayAngle = ((hour - 6) / 12) * Math.PI; // 0 at sunrise, PI at sunset
    const sunUp = Math.sin(dayAngle);
    if (sunUp > 0) {
      const x = Math.cos(dayAngle) * 320;
      const y = Math.max(12, sunUp * 320);
      const z = 140;
      sun.position.set(-x, y, z);
      sun.target.position.set(0, 0, 0);
      sunDisc.position.set(-x * 1.9, Math.max(30, y * 1.9), z * 1.9);
      sunDisc.visible = true;
      moonDisc.visible = false;
    } else {
      const nightAngle = ((hour - 18) / 12) * Math.PI;
      const moonUp = Math.sin(nightAngle);
      const x = Math.cos(nightAngle) * 300;
      const y = Math.max(20, moonUp * 300);
      sun.position.set(x, y, -120); // moonlight from the north, cool blue
      sun.target.position.set(0, 0, 0);
      moonDisc.position.set(x * 1.9, Math.max(40, y * 1.9), -120 * 1.9);
      moonDisc.visible = true;
      sunDisc.visible = false;
    }
    return timeOfDay;
  }

  // Chase camera: always behind and above the target, looking slightly ahead
  // of it. target is the player object ({ x, z, heading, onFoot, car, camYaw }).
  // When the player is on foot the camera orbits with camYaw (mouse drag);
  // in a car it sits behind the car's heading. Smoothly lerped, never snapped,
  // and never side-on.
  const desired = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  function follow(target, dt) {
    if (!target) return;
    const inCar = !target.onFoot && target.car;
    const dist = inCar ? 11 : 7.5;
    const height = inCar ? 4.6 : 3.4;
    // Behind direction: on foot use the camera orbit yaw, in a car use heading.
    const behindAngle = inCar ? target.heading : (target.camYaw ?? target.heading);
    const bx = Math.sin(behindAngle);
    const bz = Math.cos(behindAngle);
    desired.set(target.x - bx * dist, height, target.z - bz * dist);
    const smooth = 1 - Math.exp(-6 * Math.max(dt, 0.001));
    camera.position.lerp(desired, smooth);
    // Look a little ahead of the target in its facing direction.
    const fx = Math.sin(target.heading);
    const fz = Math.cos(target.heading);
    lookTarget.set(target.x + fx * 4, inCar ? 1.2 : 1.4, target.z + fz * 4);
    camera.lookAt(lookTarget);
  }

  function update(dt) {
    void dt;
    resize();
    renderer.render(scene, camera);
  }

  setTimeOfDay(timeOfDay);

  return {
    scene, camera, renderer, setTimeOfDay, update, follow,
    get timeOfDay() { return timeOfDay; },
  };
}
