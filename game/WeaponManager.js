import { Weapon } from './Weapon.js';

/**
 * WeaponManager for Lucid Dreamfight.
 * Orchestrates weapons and provides bridges for legacy index.html variables.
 */
export class WeaponManager {
    constructor(weaponsConfig) {
        this.weapons = weaponsConfig.map(config => {
            // Restore legacy reload time tuning
            const tunedReloadTime = config.reloadTime > 0
                ? config.reloadTime * 0.45 * 0.9
                : config.reloadTime

            const weapon = new Weapon({
                ...config,
                reloadTime: tunedReloadTime
            })

            // Restore legacy auto-fire overrides
            if (weapon.id === 'sniper') weapon.autoFire = false
            if (weapon.id === 'revolver') weapon.autoFire = false

            return weapon
        })
        this.currentWeaponIndex = 0

        // Legacy variable bridges
        this._reloadWeight = 0
    }

    get activeWeapon() {
        return this.weapons[this.currentWeaponIndex]
    }

    // Bridging getters for index.html compatibility
    get isReloading() {
        return this.activeWeapon.state === 'RELOADING'
    }

    get reloadTimer() {
        return this.activeWeapon.reloadTimer
    }

    get reloadWeight() {
        return this._reloadWeight
    }

    set reloadWeight(val) {
        this._reloadWeight = val
    }

    get fireCooldown() {
        return this.activeWeapon.fireCooldownTimer
    }

    set fireCooldown(val) {
        this.activeWeapon.fireCooldownTimer = val
    }

    // Main update loop called from animate()
    update(dt, inputState) {
        this._updateWeaponTimers(dt)
    }

    _updateWeaponTimers(dt) {
        if (!dt || dt <= 0) return

        // Update all weapons (for background reload if eventually implemented,
        // though currently index.html logic prevents it)
        for (const weapon of this.weapons) {
            weapon.update(dt)
        }
    }

    switchWeapon(index) {
        if (index < 0 || index >= this.weapons.length || index === this.currentWeaponIndex) return

        const prevWeapon = this.activeWeapon
        this.currentWeaponIndex = index

        // Logic for swap timing can be added here or handled in index.html as before
        // For now, we follow the "repair compatibility" rule.
    }

    attemptFire() {
        return this.activeWeapon.fire()
    }

    startReload() {
        return this.activeWeapon.startReload()
    }
}
