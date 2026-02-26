/**
 * MovementManager for Lucid Dreamfight.
 * Encapsulates movement logic (ground, air, dash, wall jump) 
 * while providing bridges for legacy variables.
 */
export class MovementManager {
    constructor(GameConfig) {
        this.config = GameConfig

        // Physics internal state
        this.velocity = { x: 0, y: 0, z: 0 }
        this.isGrounded = false

        // Timer/Charge state
        this.dashTimer = 0
        this.dashCooldownTimer = 0
        this.wallJumpCharges = this.config?.player?.wallJumpMaxCharges ?? 3
        this.wallContactTimer = 0
        this.jumpBufferTime = 0
        this.autoJumpCooldown = 0

        // Legacy bridges (accessors)
        this.lastWallContactNormal = { x: 0, y: 0, z: 0 }
        this.pendingImpulse = { x: 0, y: 0, z: 0 }
    }

    updateTimers(dt) {
        this.dashTimer = Math.max(0, this.dashTimer - dt)
        this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt)
        this.wallContactTimer = Math.max(0, this.wallContactTimer - dt)
        this.jumpBufferTime = Math.max(0, this.jumpBufferTime - dt)
        this.autoJumpCooldown = Math.max(0, this.autoJumpCooldown - dt)
    }

    addImpulse(impulse) {
        this.pendingImpulse.x += impulse.x
        this.pendingImpulse.y += impulse.y
        this.pendingImpulse.z += impulse.z
    }

    applyPendingImpulses() {
        this.velocity.x += this.pendingImpulse.x
        this.velocity.y += this.pendingImpulse.y
        this.velocity.z += this.pendingImpulse.z

        this.pendingImpulse.x = 0
        this.pendingImpulse.y = 0
        this.pendingImpulse.z = 0
    }

    applyGroundFriction(dt, friction, stopSpeed) {
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z)
        if (speed < 0.0001) return

        const drop = Math.max(speed, stopSpeed) * friction * dt
        const newSpeed = Math.max(0, speed - drop)
        const scale = newSpeed / speed

        this.velocity.x *= scale
        this.velocity.z *= scale
    }

    applyAcceleration(wishDir, targetSpeed, accel, dt) {
        const currentSpeed = this.velocity.x * wishDir.x + this.velocity.z * wishDir.z
        const addSpeed = targetSpeed - currentSpeed
        if (addSpeed <= 0) return

        const accelSpeed = accel * dt * targetSpeed
        const finalAddSpeed = Math.min(addSpeed, accelSpeed)

        this.velocity.x += finalAddSpeed * wishDir.x
        this.velocity.z += finalAddSpeed * wishDir.z
    }

    applyGravity(dt, gravity, isDashing) {
        if (!this.isGrounded) {
            this.velocity.y -= gravity * (isDashing ? 0.35 : 1.0) * dt
        }
    }

    handleJump(jumpVelocity, bhopBoost) {
        this.velocity.x *= bhopBoost
        this.velocity.z *= bhopBoost
        this.velocity.y = jumpVelocity
        this.isGrounded = false
        this.jumpBufferTime = 0
    }

    handleWallJump(normal, verticalVel, pushSpeed, tangentCarry) {
        const wallDotVel = this.velocity.x * normal.x + this.velocity.z * normal.z
        const tangentX = this.velocity.x - normal.x * wallDotVel
        const tangentZ = this.velocity.z - normal.z * wallDotVel

        this.velocity.x = tangentX * tangentCarry + normal.x * pushSpeed
        this.velocity.z = tangentZ * tangentCarry + normal.z * pushSpeed
        this.velocity.y = verticalVel

        this.wallJumpCharges -= 1
        this.wallContactTimer = 0
        this.jumpBufferTime = 0
    }

    startDash(direction, speed, duration, cooldown) {
        this.velocity.x = direction.x * speed
        this.velocity.z = direction.z * speed
        this.dashTimer = duration
        this.dashCooldownTimer = cooldown
    }
}
