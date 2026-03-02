/**
 * NetClient for Lucid Dreamfight 2-Player LAN.
 *
 * Handles WebSocket connection, state sending (20 Hz),
 * fire event sending, and server message dispatching.
 */
export class NetClient {
  constructor() {
    this.ws = null;
    this.playerId = -1;
    this.connected = false;
    this._sendInterval = 50;
    this._lastSendTime = 0;

    this._onWelcome = null;
    this._onState = null;
    this._onHit = null;
    this._onKill = null;
    this._onRespawn = null;
    this._onFire = null;
    this._onPlayerJoined = null;
    this._onPlayerLeft = null;
    this._onError = null;
    this._onOpen = null;
    this._onClose = null;
  }

  connect(url) {
    this.disconnect();

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.error("[NetClient] Failed to create WebSocket:", error);
      if (this._onError) this._onError(error);
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      console.log("[NetClient] Connected to", url);
      if (this._onOpen) this._onOpen(url);
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (error) {
        console.warn("[NetClient] Invalid server payload:", error);
        return;
      }

      this._dispatch(msg);
    };

    this.ws.onerror = (event) => {
      console.warn("[NetClient] Error:", event);
      if (this._onError) this._onError(event);
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      this.playerId = -1;
      this.ws = null;
      console.log("[NetClient] Disconnected");
      if (this._onClose) this._onClose(event);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.playerId = -1;
  }

  sendState(position, rotation, velocity, weaponId) {
    if (!this.connected || !this.ws) return;

    const now = performance.now();
    if (now - this._lastSendTime < this._sendInterval) return;
    this._lastSendTime = now;

    this._send({
      type: "state",
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
      weaponId,
    });
  }

  sendFire(origin, direction, weaponId, fireType) {
    if (!this.connected || !this.ws) return;

    this._send({
      type: "fire",
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      weaponId,
      fireType,
    });
  }

  onWelcome(cb) {
    this._onWelcome = cb;
  }

  onState(cb) {
    this._onState = cb;
  }

  onHit(cb) {
    this._onHit = cb;
  }

  onKill(cb) {
    this._onKill = cb;
  }

  onRespawn(cb) {
    this._onRespawn = cb;
  }

  onFire(cb) {
    this._onFire = cb;
  }

  onPlayerJoined(cb) {
    this._onPlayerJoined = cb;
  }

  onPlayerLeft(cb) {
    this._onPlayerLeft = cb;
  }

  onError(cb) {
    this._onError = cb;
  }

  onOpen(cb) {
    this._onOpen = cb;
  }

  onClose(cb) {
    this._onClose = cb;
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _dispatch(msg) {
    switch (msg.type) {
      case "welcome":
        this.playerId = msg.playerId;
        console.log(`[NetClient] Assigned player ID: ${this.playerId}`);
        if (this._onWelcome) this._onWelcome(msg);
        break;
      case "state":
        if (this._onState) this._onState(msg.players);
        break;
      case "hit":
        if (this._onHit) this._onHit(msg);
        break;
      case "kill":
        if (this._onKill) this._onKill(msg);
        break;
      case "respawn":
        if (this._onRespawn) this._onRespawn(msg);
        break;
      case "fire":
        if (this._onFire) this._onFire(msg);
        break;
      case "playerJoined":
        if (this._onPlayerJoined) this._onPlayerJoined(msg);
        break;
      case "playerLeft":
        if (this._onPlayerLeft) this._onPlayerLeft(msg);
        break;
      case "error":
        console.warn("[NetClient] Server error:", msg.message);
        if (this._onError) this._onError(msg);
        break;
      default:
        console.warn("[NetClient] Unknown message type:", msg.type);
        break;
    }
  }
}
