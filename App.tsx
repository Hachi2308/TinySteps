
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ACTION_WORDS, BOUNDARY } from './constants';
import { WordEntity, Particle } from './types';

const COOLDOWN_MS = 2000;
const WORD_RADIUS = 0.65;
const BASE_SPEED = 0.015;
const MAX_PARTICLES = 300;

const App: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customWordsInput, setCustomWordsInput] = useState(ACTION_WORDS.map(w => w.text).join(', '));
  const [speedMultiplier, setSpeedMultiplier] = useState(1.5);
  const [score, setScore] = useState(0);
  const [words, setWords] = useState<WordEntity[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isCooldown, setIsCooldown] = useState(false);
  const [handDetected, setHandDetected] = useState(false); // New state to track if hand is seen
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const handPosRef = useRef<{x: number, y: number, isGrabbing: boolean}>({ x: 0, y: 0, isGrabbing: false });
  const wordsRef = useRef<WordEntity[]>([]);
  const lastCatchTime = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef<number | null>(null);
  const isGrabbingLocked = useRef(false);
  const gameStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  // Updated Timer logic: only starts when handDetected is true
  useEffect(() => {
    if (isStarted && !isFinished && handDetected) {
      if (!gameStartTimeRef.current) {
        gameStartTimeRef.current = Date.now() - timeElapsed;
      }
      const start = gameStartTimeRef.current;
      timerRef.current = window.setInterval(() => {
        setTimeElapsed(Date.now() - start);
      }, 10);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, isFinished, handDetected]);

  const formatTime = (ms: number) => {
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  };

  const createExplosion = (pos: {x: number, y: number, z: number}, color: string) => {
    const newParticles: Particle[] = [];
    const count = 80;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const pitch = Math.random() * Math.PI * 2;
      const speed = 0.03 + Math.random() * 0.12;
      
      newParticles.push({
        id: `p-${Date.now()}-${i}-${Math.random()}`,
        position: { ...pos },
        velocity: {
          x: Math.cos(angle) * Math.cos(pitch) * speed,
          y: Math.sin(pitch) * speed,
          z: Math.sin(angle) * Math.cos(pitch) * speed,
        },
        color: color,
        life: 1.0
      });
    }
    setParticles(prev => [...prev, ...newParticles].slice(-MAX_PARTICLES));
  };

  const startGame = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const wordList = customWordsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#FFFF33', '#33FFFF', '#FF33A8', '#FFA500', '#00FF9F', '#FF0055'];
    const currentSpeed = BASE_SPEED * speedMultiplier;

    const initialWords = wordList.map((text, i) => ({
      id: `word-${i}-${Date.now()}`,
      text: text,
      color: colors[i % colors.length],
      caught: false,
      position: {
        x: (Math.random() - 0.5) * BOUNDARY,
        y: 1.5 + (Math.random() - 0.5) * 1,
        z: -3 - Math.random() * 2,
      },
      velocity: {
        x: (Math.random() - 0.5) * currentSpeed * 2,
        y: (Math.random() - 0.5) * currentSpeed * 2,
        z: (Math.random() - 0.5) * currentSpeed * 2,
      }
    }));

    setWords(initialWords);
    setParticles([]);
    setScore(0);
    setTimeElapsed(0);
    setHandDetected(false); // Reset for new game
    gameStartTimeRef.current = null;
    setIsStarted(true);
    setIsFinished(false);
    setShowSettings(false);
    setIsCooldown(false);
    lastCatchTime.current = 0;
    setupHandTracking();
  };

  const setupHandTracking = () => {
    const videoElement = document.getElementsByClassName('input_video')[0] as HTMLVideoElement;
    const canvasElement = document.getElementById('hand-canvas') as HTMLCanvasElement;
    const canvasCtx = canvasElement.getContext('2d')!;

    const hands = new (window as any).Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, 
      minDetectionConfidence: 0.45, // Lowered for faster initial detection
      minTrackingConfidence: 0.5,
      selfieMode: true
    });

    hands.onResults((results: any) => {
      if (!canvasCtx || !canvasElement) return;
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Hand found - trigger timer if first time
        if (!handDetected) setHandDetected(true);

        const landmarks = results.multiHandLandmarks[0];
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        
        const dist = Math.sqrt(
          Math.pow(indexTip.x - thumbTip.x, 2) + 
          Math.pow(indexTip.y - thumbTip.y, 2)
        );

        const isGrabbing = dist < 0.055;
        // Adjusted for mirror/selfie mode
        const screenX = indexTip.x * window.innerWidth;
        const screenY = indexTip.y * window.innerHeight;

        const now = Date.now();
        const cooldownActive = now - lastCatchTime.current < COOLDOWN_MS;
        setIsCooldown(cooldownActive);

        handPosRef.current = { x: screenX, y: screenY, isGrabbing };

        canvasCtx.beginPath();
        canvasCtx.arc(screenX, screenY, isGrabbing ? 40 : 25, 0, 2 * Math.PI);
        canvasCtx.fillStyle = cooldownActive ? 'rgba(255, 0, 0, 0.3)' : (isGrabbing ? 'rgba(255, 255, 0, 0.8)' : 'rgba(0, 255, 200, 0.4)');
        canvasCtx.fill();
        canvasCtx.strokeStyle = 'white';
        canvasCtx.lineWidth = 3;
        canvasCtx.stroke();

        if (cooldownActive) {
          const progress = (now - lastCatchTime.current) / COOLDOWN_MS;
          canvasCtx.beginPath();
          canvasCtx.arc(screenX, screenY, 45, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * progress));
          canvasCtx.strokeStyle = '#ef4444';
          canvasCtx.lineWidth = 5;
          canvasCtx.stroke();
        }

        if (isGrabbing && !cooldownActive && !isGrabbingLocked.current) {
          checkCollision(screenX, screenY);
        } else if (!isGrabbing) {
          isGrabbingLocked.current = false;
        }
      }
    });

    const camera = new (window as any).Camera(videoElement, {
      onFrame: async () => {
        if (videoElement.readyState >= 2) {
          await hands.send({image: videoElement});
        }
      },
      width: 1280,
      height: 720
    });
    camera.start();

    const resize = () => {
      if (canvasElement) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', resize);
    resize();
  };

  const checkCollision = (hx: number, hy: number) => {
    const sceneEl = document.querySelector('a-scene') as any;
    const AFRAME = (window as any).AFRAME;
    if (!sceneEl || !AFRAME || !AFRAME.THREE) return;

    for (const word of wordsRef.current) {
      if (word.caught) continue;

      const entity = document.getElementById(word.id);
      if (!entity) continue;

      const camera = sceneEl.camera;
      if (!camera) continue;

      const pos = new AFRAME.THREE.Vector3(word.position.x, word.position.y, word.position.z);
      pos.project(camera);

      // Mapping 3D projected space to screen pixels
      const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

      const distance = Math.sqrt(Math.pow(hx - x, 2) + Math.pow(hy - y, 2));
      if (distance < 160) {
        handleCatch(word.id);
        isGrabbingLocked.current = true;
        break; 
      }
    }
  };

  const handleCatch = useCallback((id: string) => {
    const now = Date.now();
    lastCatchTime.current = now;

    setWords(prev => {
      const target = prev.find(w => w.id === id);
      if (!target || target.caught) return prev;

      createExplosion(target.position, target.color);

      if (audioContextRef.current) {
        const osc = audioContextRef.current.createOscillator();
        const gain = audioContextRef.current.createGain();
        osc.connect(gain);
        gain.connect(audioContextRef.current.destination);
        osc.frequency.setValueAtTime(300, audioContextRef.current.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, audioContextRef.current.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + 0.15);
        osc.start();
        osc.stop(audioContextRef.current.currentTime + 0.15);
      }

      const updated = prev.map(w => w.id === id ? { ...w, caught: true } : w);
      const newScore = updated.filter(w => w.caught).length;
      setScore(newScore);
      if (newScore === prev.length) {
        setIsFinished(true);
      }
      return updated;
    });
  }, []);

  const update = useCallback(() => {
    if (!isStarted || isFinished) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    setWords(prev => {
      const newWords = prev.map(w => ({...w}));
      
      for (let w of newWords) {
        if (w.caught) continue;
        w.position.x += w.velocity.x;
        w.position.y += w.velocity.y;
        w.position.z += w.velocity.z;

        if (Math.abs(w.position.x) > BOUNDARY/1.5) w.velocity.x *= -1;
        if (w.position.y < 0.7 || w.position.y > 2.9) w.velocity.y *= -1;
        if (w.position.z < -5.5 || w.position.z > -1.2) w.velocity.z *= -1;
      }

      for (let i = 0; i < newWords.length; i++) {
        for (let j = i + 1; j < newWords.length; j++) {
          const w1 = newWords[i];
          const w2 = newWords[j];
          if (w1.caught || w2.caught) continue;

          const dx = w1.position.x - w2.position.x;
          const dy = w1.position.y - w2.position.y;
          const dz = w1.position.z - w2.position.z;
          const distSq = dx*dx + dy*dy + dz*dz;
          const minDist = WORD_RADIUS * 2;

          if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.1;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            const rvx = w1.velocity.x - w2.velocity.x;
            const rvy = w1.velocity.y - w2.velocity.y;
            const rvz = w1.velocity.z - w2.velocity.z;
            const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

            if (velAlongNormal > 0) continue;

            const impulse = velAlongNormal;
            w1.velocity.x -= impulse * nx;
            w1.velocity.y -= impulse * ny;
            w1.velocity.z -= impulse * nz;
            w2.velocity.x += impulse * nx;
            w2.velocity.y += impulse * ny;
            w2.velocity.z += impulse * nz;

            const overlap = (minDist - dist) / 2;
            w1.position.x += nx * overlap;
            w1.position.y += ny * overlap;
            w1.position.z += nz * overlap;
            w2.position.x -= nx * overlap;
            w2.position.y -= ny * overlap;
            w2.position.z -= nz * overlap;
          }
        }
      }
      return newWords;
    });

    setParticles(prev => prev
      .map(p => ({
        ...p,
        position: {
          x: p.position.x + p.velocity.x,
          y: p.position.y + p.velocity.y,
          z: p.position.z + p.velocity.z
        },
        life: p.life - 0.015
      }))
      .filter(p => p.life > 0)
    );

    requestRef.current = requestAnimationFrame(update);
  }, [isStarted, isFinished]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div className="relative w-full h-full font-sans overflow-hidden bg-black">
      <div className="absolute top-0 left-0 w-full p-4 z-20 flex justify-between items-start pointer-events-none">
        <div className="bg-white/95 backdrop-blur-2xl rounded-[2rem] px-8 py-5 shadow-2xl border-2 border-emerald-400 pointer-events-auto">
          <h1 className="text-3xl font-black text-emerald-600 leading-none mb-2 uppercase tracking-tight italic">TinySteps</h1>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiến độ</span>
              <div className="h-4 w-48 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-all duration-700" 
                  style={{ width: words.length > 0 ? `${(score / words.length) * 100}%` : '0%' }}
                ></div>
              </div>
              <span className="text-lg font-black text-emerald-600">{score}/{words.length}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thời gian</span>
              <span className="text-2xl font-mono font-black text-slate-700 tabular-nums">{formatTime(timeElapsed)}</span>
            </div>
          </div>
        </div>
        
        <div className="pointer-events-auto flex flex-col gap-3">
           <button 
            onClick={() => setShowSettings(true)}
            className="bg-white/90 backdrop-blur hover:bg-white p-4 rounded-3xl shadow-xl border-2 border-slate-100 transition-all hover:scale-110 active:scale-95"
           >
            <span className="text-2xl">⚙️</span>
           </button>
           {isCooldown && (
             <div className="bg-red-500 text-white px-4 py-2 rounded-2xl font-black text-xs uppercase animate-pulse shadow-lg text-center">
               HỒI CHIÊU...
             </div>
           )}
        </div>
      </div>

      {/* Hand detection status overlay */}
      {isStarted && !handDetected && !isFinished && (
        <div className="absolute inset-x-0 top-32 z-30 flex justify-center pointer-events-none">
          <div className="bg-emerald-500/80 backdrop-blur px-6 py-3 rounded-full border-2 border-white animate-bounce shadow-2xl">
            <span className="text-white font-black uppercase tracking-widest">Giơ tay lên để bắt đầu! 🤲</span>
          </div>
        </div>
      )}

      {!isStarted && !showSettings && (
        <div className="absolute inset-0 bg-emerald-900/50 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-sm border-b-[20px] border-emerald-50">
            <div className="text-8xl mb-8 transform hover:scale-110 transition-transform">🤲</div>
            <h2 className="text-4xl font-black text-slate-800 mb-4 tracking-tighter uppercase">Word Catch!</h2>
            <p className="text-slate-500 mb-12 leading-relaxed font-bold text-lg">
              Giơ tay lên camera để đếm giờ và bắt các từ. Mỗi 2 giây chỉ tóm được 1 từ.
            </p>
            <div className="flex flex-col gap-4">
              <button 
                onClick={startGame}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-6 px-8 rounded-[2rem] transition-all shadow-[0_12px_0_rgb(5,150,105)] active:shadow-none active:translate-y-3 text-3xl uppercase tracking-tighter"
              >
                BẮT ĐẦU
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold py-4 px-8 rounded-2xl transition-all"
              >
                CÀI ĐẶT
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-3xl z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic">Cài đặt</h2>
              <button onClick={() => setShowSettings(false)} className="bg-slate-100 p-3 rounded-full text-slate-400 text-3xl font-light hover:bg-red-50 hover:text-red-400 transition-colors">&times;</button>
            </div>
            
            <div className="mb-6">
              <p className="text-slate-400 font-black mb-3 text-xs uppercase tracking-widest">Danh sách từ vựng:</p>
              <textarea 
                className="w-full h-32 p-5 bg-slate-50 border-4 border-slate-100 rounded-[1.5rem] focus:border-emerald-400 focus:outline-none font-bold text-slate-700 leading-relaxed text-lg shadow-inner"
                value={customWordsInput}
                onChange={(e) => setCustomWordsInput(e.target.value)}
                placeholder="Nhập các từ, cách nhau bằng dấu phẩy..."
              />
            </div>

            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <p className="text-slate-400 font-black text-xs uppercase tracking-widest">Tốc độ di chuyển:</p>
                <span className="text-emerald-600 font-black text-sm">{speedMultiplier.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="5" 
                step="0.1" 
                value={speedMultiplier} 
                onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                className="w-full h-3 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <button 
              onClick={startGame}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-5 px-8 rounded-[2rem] shadow-[0_10px_0_rgb(5,150,105)] active:shadow-none active:translate-y-2 text-2xl uppercase tracking-widest"
            >
              LƯU & CHƠI
            </button>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="absolute inset-0 bg-emerald-500/90 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-6 text-center animate-in slide-in-from-top duration-700">
          <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-sm border-b-[20px] border-emerald-100">
            <div className="text-9xl mb-8 animate-bounce">🥇</div>
            <h2 className="text-4xl font-black text-slate-800 mb-2 uppercase tracking-tighter">XUẤT SẮC!</h2>
            <div className="bg-emerald-50 rounded-[2.5rem] py-8 my-8 border-4 border-emerald-100">
              <p className="text-emerald-400 font-black uppercase text-xs mb-2 tracking-widest">Thời gian hoàn thành</p>
              <p className="text-6xl font-black text-emerald-600 font-mono tracking-tighter tabular-nums">{formatTime(timeElapsed)}</p>
            </div>
            <button 
              onClick={startGame}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-6 px-8 rounded-3xl text-2xl shadow-xl transition-all"
            >
              CHƠI LẠI
            </button>
          </div>
        </div>
      )}

      {isStarted && (
        <a-scene 
          embedded 
          vr-mode-ui="enabled: false"
          renderer="alpha: true; antialias: true; colorManagement: true;"
        >
          {words.map((word) => !word.caught && (
            <a-entity
              key={word.id}
              id={word.id}
              position={`${word.position.x} ${word.position.y} ${word.position.z}`}
            >
              <a-text
                value={word.text}
                align="center"
                color={word.color}
                font="https://cdn.aframe.io/fonts/Aileron-Semibold.fnt"
                width="7.5"
                scale="1.4 1.4 1.4"
                animation="property: scale; from: 1.4 1.4 1.4; to: 1.5 1.5 1.5; dir: alternate; dur: 400; loop: true"
              ></a-text>
              <a-sphere
                radius={WORD_RADIUS}
                material={`color: ${word.color}; opacity: 0.25; transparent: true; roughness: 0.1; metalness: 0.4;`}
              ></a-sphere>
            </a-entity>
          ))}

          {particles.map((p) => (
            <a-sphere
              key={p.id}
              position={`${p.position.x} ${p.position.y} ${p.position.z}`}
              radius={0.045 + p.life * 0.12}
              material={`color: ${p.color}; opacity: ${p.life}; transparent: true; emissive: ${p.color}; emissiveIntensity: 5;`}
            ></a-sphere>
          ))}

          <a-light type="ambient" intensity="1.8"></a-light>
          <a-light type="directional" position="2 5 -3" intensity="1.2"></a-light>
        </a-scene>
      )}
    </div>
  );
};

export default App;
