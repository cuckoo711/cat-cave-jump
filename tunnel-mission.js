"use strict";

class TunnelMission {
    static legDistance = 15000;
    static maxJump = 50;
    static maxDrift = 10 * Math.PI / 180;
    static correctionCos = Math.cos(30 * Math.PI / 180);

    constructor() {
        this.origin = { x: 0, y: 0, z: 0 };
        this.destination = { x: TunnelMission.legDistance, y: 0, z: 0 };
        this.reset();
    }

    reset() {
        this.phase = "outbound";
        this.position = this.origin;
        this.heading = { x: 1, y: 0, z: 0 };
        this.travelled = 0;
        this.lastJump = 0;
        this.corrections = 0;
        this.corrected = false;
        this.route = [this.origin];
        this.turnIndex = null;
    }

    get target() { return this.phase === "outbound" ? this.destination : this.origin; }

    get remaining() {
        const { x, y, z } = this.position;
        return Math.hypot(this.target.x - x, this.target.y - y, this.target.z - z);
    }

    planMove() {
        const { x, y, z } = this.position;
        const target = this.target;
        const remaining = this.remaining;
        const aim = { x: (target.x - x) / remaining, y: (target.y - y) / remaining, z: (target.z - z) / remaining };
        const drifted = this.driftHeading();
        const corrected = drifted.x * aim.x + drifted.y * aim.y + drifted.z * aim.z < TunnelMission.correctionCos;
        return { direction: corrected || remaining <= TunnelMission.maxJump ? aim : drifted, corrected };
    }

    advance(power, plannedMove) {
        if (this.phase === "complete" || !(power > 0)) return;
        const { x, y, z } = this.position;
        const target = this.target;
        const remaining = this.remaining;
        const reach = Math.min(power, 1) * TunnelMission.maxJump;
        const { direction, corrected } = plannedMove ?? this.planMove();
        this.corrected = corrected;
        if (this.corrected) this.corrections++;

        // Within this jump's range, finish at the target without overshooting it.
        const arrived = remaining <= reach;
        this.lastJump = arrived ? remaining : reach;
        this.travelled += this.lastJump;
        this.position = arrived ? target : {
            x: x + direction.x * this.lastJump,
            y: y + direction.y * this.lastJump,
            z: z + direction.z * this.lastJump
        };
        this.route.push(this.position);
        this.heading = direction;

        if (arrived && this.phase === "outbound") {
            this.turnIndex = this.route.length - 1;
            this.phase = "return";
            this.heading = { x: -1, y: 0, z: 0 };
        } else if (arrived) {
            this.phase = "complete";
        }
    }

    driftHeading() {
        const { x, y, z } = this.heading;
        // Build two perpendicular directions around the current 3D heading.
        const side = Math.abs(z) < .9 ? { x: y, y: -x, z: 0 } : { x: -z, y: 0, z: x };
        const size = Math.hypot(side.x, side.y, side.z);
        const sx = side.x / size, sy = side.y / size, sz = side.z / size;
        const azimuth = Math.random() * Math.PI * 2;
        const angle = Math.random() * TunnelMission.maxDrift;
        const forward = Math.cos(angle);
        const across = Math.sin(angle) * Math.cos(azimuth);
        const vertical = Math.sin(angle) * Math.sin(azimuth);
        return {
            x: x * forward + sx * across + (y * sz - z * sy) * vertical,
            y: y * forward + sy * across + (z * sx - x * sz) * vertical,
            z: z * forward + sz * across + (x * sy - y * sx) * vertical
        };
    }
}
