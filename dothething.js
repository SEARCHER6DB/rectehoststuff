(async () => {
    try {
        // Attend UnityWebModkit
        while (!window.UnityWebModkit) {
            await new Promise(r => setTimeout(r, 100));
        }
        const ctx = UnityWebModkit.Runtime.createPlugin({
            name: "Hax",
            version: "1.0.0",
            referencedAssemblies: [
                "ACTk.Runtime.dll",
                "GameAssembly.dll",
                "System.Runtime.InteropServices.dll",
                "mscorlib.dll",
                "PhotonRealtime.dll",
                "PhotonUnityNetworking.dll",
                "PhotonUnityNetworking.Utilities.dll",
                "Assembly-CSharp.dll",
                "UnityEngine.CoreModule.dll",
                "UnityEngine.PhysicsModule.dll",
                "StompyRobot.SRDebugger.dll",
                "UnityEngine.IMGUIModule.dll",
                "Photon3Unity3D.dll",
                "Unity.TextMeshPro.dll",
                "FishNet.Runtime.dll",
                "UnityEngine.AnimationModule.dll",
            ],
        });

        window.ctx = ctx;
        console.log("[dothething] Plugin Hax créé");

        // ==================================================================
        // ESP — Hook Character::Update (déjà validé comme fonctionnel)
        // À chaque frame, on lit le ptr du Character et on tente d'en extraire
        // des sous-structures qui contiendraient la position.
        // ==================================================================

        // Stockage global des joueurs vus
        window.__espPlayers = new Map();

        // Hook 1 : Character::Update — capture le ptr du joueur local
        ctx.hookPostfix(
            { typeName: "ECM2.Characters.Character", methodName: "Update", params: [] },
            (self) => {
                try {
                    const selfPtr = self.val();
                    if (!selfPtr) return;

                    // Enregistre / met à jour le joueur
                    const now = Date.now();
                    let entry = window.__espPlayers.get(selfPtr);
                    if (!entry) {
                        entry = {
                            ptr: selfPtr,
                            firstSeen: now,
                            lastSeen: now,
                            // Lit les 32 premiers floats pour trouver une position
                            floats: [],
                        };
                        // Lit 64 floats depuis le ptr (256 octets)
                        const heapF32 = UnityWebModkit.Runtime._game.Module.HEAPF32;
                        for (let i = 0; i < 64; i++) {
                            const v = heapF32[(selfPtr >>> 2) + i];
                            if (Number.isFinite(v)) {
                                entry.floats.push({ off: i * 4, v });
                            }
                        }
                        window.__espPlayers.set(selfPtr, entry);
                        console.log("[ESP] Nouveau Character @0x" + selfPtr.toString(16) +
                            " — " + entry.floats.length + " floats lus");
                    } else {
                        entry.lastSeen = now;
                    }

                    // Cherche le sous-composant à 0xb4 (vu dans les scans précédents)
                    // et lit ses 64 premiers floats
                    const heap32 = UnityWebModkit.Runtime._game.Module.HEAP32;
                    const heapF32 = UnityWebModkit.Runtime._game.Module.HEAPF32;
                    const subPtr = heap32[(selfPtr + 0xb4) >>> 2] >>> 0;
                    if (subPtr > 0x10000 && subPtr < 0x5000000 && !entry.subPtr) {
                        entry.subPtr = subPtr;
                        entry.subFloats = [];
                        for (let i = 0; i < 64; i++) {
                            const v = heapF32[(subPtr >>> 2) + i];
                            if (Number.isFinite(v) && Math.abs(v) < 100000) {
                                entry.subFloats.push({ off: i * 4, v });
                            }
                        }
                        console.log("[ESP] Sous-composant @0x" + subPtr.toString(16) +
                            " — " + entry.subFloats.length + " floats lus");
                    }
                } catch (e) {
                    console.log("[ESP] err:", e.message);
                }
            }
        );

        // Hook 2 : Character::LateUpdate (si disponible) — deuxième chance
        try {
            ctx.hookPostfix(
                { typeName: "ECM2.Characters.Character", methodName: "LateUpdate", params: [] },
                (self) => {
                    try {
                        const selfPtr = self.val();
                        if (!selfPtr) return;
                        // Met à jour les floats du Character
                        const heapF32 = UnityWebModkit.Runtime._game.Module.HEAPF32;
                        const entry = window.__espPlayers.get(selfPtr);
                        if (entry) {
                            entry.floats = [];
                            for (let i = 0; i < 64; i++) {
                                const v = heapF32[(selfPtr >>> 2) + i];
                                if (Number.isFinite(v)) entry.floats.push({ off: i * 4, v });
                            }
                        }
                    } catch (e) {}
                }
            );
            console.log("[ESP] Hook Character::LateUpdate posé");
        } catch (e) {
            console.log("[ESP] LateUpdate indisponible:", e.message);
        }

        // Overlay de debug
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;';
        document.documentElement.appendChild(cv);
        const ctx2d = cv.getContext('2d');
        const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
        addEventListener('resize', resize); resize();

        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;top:8px;left:8px;font:11px monospace;color:#0f0;background:rgba(0,0,0,0.75);padding:8px;border-radius:4px;z-index:2147483647;pointer-events:none;max-width:520px;white-space:pre;';
        document.documentElement.appendChild(panel);

        function loop() {
            const now = Date.now();
            let txt = 'ESP — BuildNow GG\n';
            txt += '==================\n';
            let n = 0;
            for (const [ptr, e] of window.__espPlayers) {
                if (now - e.lastSeen > 5000) continue;
                n++;
                txt += '\nCharacter #' + n + ' @0x' + ptr.toString(16) + '\n';
                // Affiche les 12 premiers floats
                txt += ' Floats: ';
                for (let i = 0; i < Math.min(12, e.floats.length); i++) {
                    txt += e.floats[i].v.toFixed(2) + ' ';
                }
                txt += '\n';
                if (e.subPtr) {
                    txt += ' Sub @0x' + e.subPtr.toString(16) + ': ';
                    for (let i = 0; i < Math.min(12, e.subFloats.length); i++) {
                        txt += e.subFloats[i].v.toFixed(2) + ' ';
                    }
                    txt += '\n';
                }
            }
            if (n === 0) txt += '\n(Aucun Character détecté)\n';
            panel.textContent = txt;

            // Crosshair
            ctx2d.strokeStyle = '#0f0';
            ctx2d.lineWidth = 1.5;
            const cx = cv.width / 2, cy = cv.height / 2;
            ctx2d.beginPath();
            ctx2d.moveTo(cx, cy - 12); ctx2d.lineTo(cx, cy - 4);
            ctx2d.moveTo(cx, cy + 4); ctx2d.lineTo(cx, cy + 12);
            ctx2d.moveTo(cx - 12, cy); ctx2d.lineTo(cx - 4, cy);
            ctx2d.moveTo(cx + 4, cy); ctx2d.lineTo(cx + 12, cy);
            ctx2d.stroke();

            requestAnimationFrame(loop);
        }
        loop();

        console.log("[ESP] Prêt. Rejoins une partie et regarde le panneau.");

    } catch (err) {
        console.error("Error initializing plugin:", err);
    }
})();
