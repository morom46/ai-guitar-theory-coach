/**
 * DRONE — React glue.
 *
 * The drone itself is plain module state (see ./drone.js) rather than a
 * context, because it is genuinely global: one tone, one root, shared by every
 * page. Components just subscribe.
 */

import { useEffect, useState } from "react";
import {
  subscribe,
  getDroneState,
  startDrone,
  stopDrone,
  toggleDrone,
  setDroneRoot,
  setDroneFifth,
  setDroneFollow,
} from "./drone.js";

/** Live drone state plus its controls. */
export function useDrone() {
  const [s, setS] = useState(getDroneState);
  useEffect(() => subscribe(setS), []);
  return {
    ...s,
    start: startDrone,
    stop: stopDrone,
    toggle: toggleDrone,
    setRoot: setDroneRoot,
    setFifth: setDroneFifth,
    setFollow: setDroneFollow,
  };
}

/**
 * Keep the drone tuned to the key a page is currently showing.
 *
 * One line per page. Honours the user's "follow" switch: with it off, the
 * drone stays wherever they parked it no matter what page they're on — which
 * matters when you deliberately want to hear a scale against a *foreign* root.
 */
export function useDroneFollow(root) {
  // Watch the follow flag as well as the key: without it, switching following
  // back ON does nothing until the page's key next happens to change, so the
  // toggle reads as broken.
  const [follow, setFollow] = useState(() => getDroneState().follow);
  useEffect(() => subscribe((s) => setFollow(s.follow)), []);

  useEffect(() => {
    if (!root || !follow) return;
    setDroneRoot(root, { fromFollow: true });
  }, [root, follow]);
}
