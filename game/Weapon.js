/**
 * Weapon class for Lucid Dreamfight.
 * Handles firing logic, ammo, and FSM states.
 */
export class Weapon {
    constructor(config) {
        Object.assign(this, config);

        // State variables
        this.currentAmmo = this.currentAmmo !== undefined ? this.currentAmmo : (config.clipSize || 0);
        this.reserveAmmo = this.reserveAmmo !== undefined ? this.reserveAmmo : (config.reserveAmmo || 0);

        this.fireCooldownTimer = 0;
        this.reloadTimer = 0;
        this.swapTimer = 0;

        this.state = 'IDLE'; // IDLE, FIRING, RELOADING, SWAPPING, COOLDOWN
    }

    update(dt) {
        if (this.fireCooldownTimer > 0) {
            this.fireCooldownTimer = Math.max(0, this.fireCooldownTimer - dt);
        }

        if (this.reloadTimer > 0) {
            this.reloadTimer = Math.max(0, this.reloadTimer - dt);
            if (this.reloadTimer === 0) {
                this.completeReload();
            }
        }

        if (this.swapTimer > 0) {
            this.swapTimer = Math.max(0, this.swapTimer - dt);
            if (this.swapTimer === 0) {
                this.state = 'IDLE';
            }
        }

        // State transition back to IDLE if cooldowns are done
        if (this.state === 'COOLDOWN' && this.fireCooldownTimer === 0) {
            this.state = 'IDLE';
        }
    }

    canFire() {
        return this.state === 'IDLE' &&
            this.fireCooldownTimer <= 0 &&
            (this.clipSize === 0 || this.currentAmmo > 0);
    }

    fire() {
        if (!this.canFire()) return false;

        if (this.clipSize > 0) {
            this.currentAmmo--;
        }

        this.fireCooldownTimer = this.fireInterval;
        this.state = 'COOLDOWN';
        return true;
    }

    canReload() {
        return (this.state === 'IDLE' || this.state === 'COOLDOWN') &&
            this.clipSize > 0 &&
            this.currentAmmo < this.clipSize &&
            this.reserveAmmo > 0;
    }

    startReload() {
        if (!this.canReload()) return false;

        this.reloadTimer = this.reloadTime;
        this.state = 'RELOADING';
        return true;
    }

    completeReload() {
        const needed = this.clipSize - this.currentAmmo;
        const toReload = Math.min(needed, this.reserveAmmo);

        this.currentAmmo += toReload;
        this.reserveAmmo -= toReload;
        this.state = 'IDLE';
    }

    startSwap(duration) {
        this.state = 'SWAPPING';
        this.swapTimer = duration;
        this.reloadTimer = 0; // Cancel reload on swap
    }
}
