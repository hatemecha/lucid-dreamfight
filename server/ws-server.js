/**
 * Lucid Dreamfight — 2-Player LAN WebSocket Server
 * 
 * Authoritative for: health, hits, deaths, respawn.
 * Clients send: state updates (pos/rot/vel) and fire events.
 * Server broadcasts: player states, fire events, hit events, kill events, respawn events.
 */

const { WebSocketServer } = require('ws');

const PORT = 9001;
const MAX_PLAYERS = 2;
const RESPAWN_DELAY_MS = 3000;
const STATE_BROADCAST_INTERVAL_MS = 50; // 20 Hz
const MAX_HP = 100;

// Spawn points aligned with the current arena's fixed spawn platform.
// The client builds that platform around z ~= 4.89 with feet height ~= 1.17.
// Keeping both players on that stable tile avoids spawning inside old terrain coordinates.
const SPAWN_PLATFORM_Z = 4.890476190476191;
const SPAWN_FEET_Y = 1.174097930019891;
const SPAWNS = [
    { x: -1.2, y: SPAWN_FEET_Y, z: SPAWN_PLATFORM_Z },
    { x: 1.2, y: SPAWN_FEET_Y, z: SPAWN_PLATFORM_Z }
];

// Weapon damage table (mirrors GameConfig.weapons)
const WEAPON_DAMAGE = {
    fists: { damage: 52, fireType: 'melee', range: 2.2 },
    revolver: { damage: 34, fireType: 'hitscan', range: 170 },
    shotgun: { damage: 16, fireType: 'hitscan', range: 58, pellets: 9 },
    sniper: { damage: 125, fireType: 'hitscan', range: 260 },
    bazooka: { damage: 120, fireType: 'projectile', range: 50, explosionRadius: 5.4 }
};

// Player hitbox dimensions (capsule approximation as AABB)
const PLAYER_RADIUS = 0.42;
const PLAYER_HEIGHT = 1.7;

// ─── Player State ───────────────────────────────────────────────

function createPlayerState(id) {
    const spawn = SPAWNS[id] || SPAWNS[0];
    return {
        id,
        position: { x: spawn.x, y: spawn.y, z: spawn.z },
        rotation: { x: 0, y: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        hp: MAX_HP,
        alive: true,
        weaponId: 'revolver',
        ws: null
    };
}

const players = [null, null];
let projectiles = [];
let nextProjectileId = 0;

// ─── Utility ────────────────────────────────────────────────────

function send(ws, msg) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
    }
}

function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of players) {
        if (p && p.ws && p.ws.readyState === 1) {
            p.ws.send(data);
        }
    }
}

function broadcastExcept(excludeId, msg) {
    const data = JSON.stringify(msg);
    for (const p of players) {
        if (p && p.id !== excludeId && p.ws && p.ws.readyState === 1) {
            p.ws.send(data);
        }
    }
}

// ─── Hit Detection ──────────────────────────────────────────────

function rayVsAABB(origin, direction, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
    let tmin = 0;
    let tmax = maxDist;

    for (let axis = 0; axis < 3; axis++) {
        const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
        const d = axis === 0 ? direction.x : axis === 1 ? direction.y : direction.z;
        const mn = axis === 0 ? minX : axis === 1 ? minY : minZ;
        const mx = axis === 0 ? maxX : axis === 1 ? maxY : maxZ;

        if (Math.abs(d) < 1e-8) {
            if (o < mn || o > mx) return -1;
        } else {
            let t1 = (mn - o) / d;
            let t2 = (mx - o) / d;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return -1;
        }
    }

    return tmin;
}

function getPlayerAABB(playerState) {
    const p = playerState.position;
    return {
        minX: p.x - PLAYER_RADIUS,
        minY: p.y,
        minZ: p.z - PLAYER_RADIUS,
        maxX: p.x + PLAYER_RADIUS,
        maxY: p.y + PLAYER_HEIGHT,
        maxZ: p.z + PLAYER_RADIUS
    };
}

function pointInAABB(px, py, pz, minX, minY, minZ, maxX, maxY, maxZ) {
    return px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ;
}

function distSq3(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

// ─── Damage Application ────────────────────────────────────────

function applyDamage(attackerId, victimId, damage, weaponId) {
    const victim = players[victimId];
    if (!victim || !victim.alive) return;

    victim.hp = Math.max(0, victim.hp - damage);

    broadcast({
        type: 'hit',
        attackerId,
        victimId,
        damage,
        newHp: victim.hp,
        weaponId
    });

    if (victim.hp <= 0) {
        victim.alive = false;
        broadcast({
            type: 'kill',
            killerId: attackerId,
            victimId,
            weaponId
        });

        // Schedule respawn
        setTimeout(() => {
            if (!players[victimId]) return;
            const spawn = SPAWNS[victimId];
            victim.hp = MAX_HP;
            victim.alive = true;
            victim.position.x = spawn.x;
            victim.position.y = spawn.y;
            victim.position.z = spawn.z;
            victim.velocity.x = 0;
            victim.velocity.y = 0;
            victim.velocity.z = 0;

            broadcast({
                type: 'respawn',
                playerId: victimId,
                spawnPos: { ...spawn },
                hp: MAX_HP
            });
        }, RESPAWN_DELAY_MS);
    }
}

// ─── Fire Handling ──────────────────────────────────────────────

function handleFire(attackerId, msg) {
    const attacker = players[attackerId];
    if (!attacker || !attacker.alive) return;

    const weaponId = msg.weaponId || 'revolver';
    const weaponDef = WEAPON_DAMAGE[weaponId];
    if (!weaponDef) return;

    const origin = msg.origin;
    const direction = msg.direction;
    if (!origin || !direction) return;

    // Normalize direction
    const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (len < 0.0001) return;
    const dx = direction.x / len;
    const dy = direction.y / len;
    const dz = direction.z / len;
    const dir = { x: dx, y: dy, z: dz };

    broadcastExcept(attackerId, {
        type: 'fire',
        attackerId,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { ...dir },
        weaponId,
        fireType: weaponDef.fireType
    });

    if (weaponDef.fireType === 'hitscan' || weaponDef.fireType === 'melee') {
        const pellets = weaponDef.pellets || 1;
        const range = weaponDef.range || 100;

        for (let p = 0; p < pellets; p++) {
            // For simplicity, server doesn't simulate spread — checks center ray
            // (spread is purely cosmetic on client)
            for (const target of players) {
                if (!target || target.id === attackerId || !target.alive) continue;
                const aabb = getPlayerAABB(target);
                const t = rayVsAABB(origin, dir, aabb.minX, aabb.minY, aabb.minZ, aabb.maxX, aabb.maxY, aabb.maxZ, range);
                if (t >= 0) {
                    applyDamage(attackerId, target.id, weaponDef.damage, weaponId);
                }
            }
        }
    } else if (weaponDef.fireType === 'projectile') {
        // Track projectile for explosion check
        projectiles.push({
            id: nextProjectileId++,
            attackerId,
            weaponId,
            position: { x: origin.x, y: origin.y, z: origin.z },
            velocity: { x: dir.x * 36, y: dir.y * 36, z: dir.z * 36 },
            life: 4.2,
            explosionRadius: weaponDef.explosionRadius || 5.4,
            damage: weaponDef.damage
        });
    }
}

// ─── Server Tick ────────────────────────────────────────────────

function serverTick() {
    const dt = STATE_BROADCAST_INTERVAL_MS / 1000;

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.life -= dt;

        // Move projectile
        proj.velocity.y -= 4.2 * dt;
        proj.position.x += proj.velocity.x * dt;
        proj.position.y += proj.velocity.y * dt;
        proj.position.z += proj.velocity.z * dt;

        // Check ground collision
        let explode = proj.life <= 0 || proj.position.y <= 0;

        // Check player collision
        if (!explode) {
            for (const target of players) {
                if (!target || target.id === proj.attackerId || !target.alive) continue;
                const aabb = getPlayerAABB(target);
                if (pointInAABB(
                    proj.position.x, proj.position.y, proj.position.z,
                    aabb.minX - 0.12, aabb.minY - 0.12, aabb.minZ - 0.12,
                    aabb.maxX + 0.12, aabb.maxY + 0.12, aabb.maxZ + 0.12
                )) {
                    explode = true;
                    break;
                }
            }
        }

        if (explode) {
            // Explosion damage to all players in radius
            const radius = proj.explosionRadius;
            const radiusSq = radius * radius;
            for (const target of players) {
                if (!target || !target.alive) continue;
                const centerX = target.position.x;
                const centerY = target.position.y + PLAYER_HEIGHT * 0.5;
                const centerZ = target.position.z;
                const dSq = distSq3(proj.position.x, proj.position.y, proj.position.z, centerX, centerY, centerZ);
                if (dSq <= radiusSq) {
                    const dist = Math.sqrt(dSq);
                    const falloff = 1 - Math.min(dist / radius, 1);
                    const damage = Math.round(proj.damage * falloff);
                    if (damage > 0) {
                        applyDamage(proj.attackerId, target.id, damage, proj.weaponId);
                    }
                }
            }
            projectiles.splice(i, 1);
        }
    }

    // Broadcast state
    const statePlayers = [];
    for (const p of players) {
        if (!p) continue;
        statePlayers.push({
            id: p.id,
            position: { ...p.position },
            rotation: { ...p.rotation },
            velocity: { ...p.velocity },
            hp: p.hp,
            alive: p.alive,
            weaponId: p.weaponId
        });
    }

    if (statePlayers.length > 0) {
        broadcast({ type: 'state', players: statePlayers });
    }
}

// ─── WebSocket Server ───────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

console.log(`[Lucid Dreamfight] LAN server listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
    // Find free slot
    let assignedId = -1;
    for (let i = 0; i < MAX_PLAYERS; i++) {
        if (!players[i]) {
            assignedId = i;
            break;
        }
    }

    if (assignedId === -1) {
        send(ws, { type: 'error', message: 'Server full (max 2 players)' });
        ws.close();
        return;
    }

    const playerState = createPlayerState(assignedId);
    playerState.ws = ws;
    players[assignedId] = playerState;

    console.log(`[Player ${assignedId}] Connected. Spawn: (${playerState.position.x}, ${playerState.position.y}, ${playerState.position.z})`);

    // Send welcome to the new player
    const enemyStates = [];
    for (const p of players) {
        if (p && p.id !== assignedId) {
            enemyStates.push({
                id: p.id,
                position: { ...p.position },
                rotation: { ...p.rotation },
                hp: p.hp,
                alive: p.alive,
                weaponId: p.weaponId
            });
        }
    }

    send(ws, {
        type: 'welcome',
        playerId: assignedId,
        spawnPos: { ...SPAWNS[assignedId] },
        enemies: enemyStates
    });

    // Notify others
    broadcastExcept(assignedId, {
        type: 'playerJoined',
        playerId: assignedId,
        spawnPos: { ...SPAWNS[assignedId] }
    });

    // Handle messages
    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (_) {
            return;
        }

        if (msg.type === 'state') {
            // Client state update
            if (msg.position) {
                playerState.position.x = msg.position.x;
                playerState.position.y = msg.position.y;
                playerState.position.z = msg.position.z;
            }
            if (msg.rotation) {
                playerState.rotation.x = msg.rotation.x;
                playerState.rotation.y = msg.rotation.y;
            }
            if (msg.velocity) {
                playerState.velocity.x = msg.velocity.x;
                playerState.velocity.y = msg.velocity.y;
                playerState.velocity.z = msg.velocity.z;
            }
            if (msg.weaponId) {
                playerState.weaponId = msg.weaponId;
            }
        } else if (msg.type === 'fire') {
            handleFire(assignedId, msg);
        }
    });

    ws.on('close', () => {
        console.log(`[Player ${assignedId}] Disconnected.`);
        players[assignedId] = null;
        broadcast({ type: 'playerLeft', playerId: assignedId });
    });

    ws.on('error', (err) => {
        console.error(`[Player ${assignedId}] WS error:`, err.message);
    });
});

// Start broadcast loop
setInterval(serverTick, STATE_BROADCAST_INTERVAL_MS);
