'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Trophy,
  Sparkles,
  Clock,
  Heart,
  QrCode,
  Maximize2,
  Minimize2,
  Award,
  Crown,
  ChevronRight,
  ChevronLeft,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const getCleanSupabaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try {
    const parsed = new URL(envUrl.startsWith('http') ? envUrl : `https://${envUrl}`);
    return parsed.origin;
  } catch {
    return 'https://placeholder.supabase.co';
  }
};

const supabaseUrl = getCleanSupabaseUrl();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder');

interface Photo {
  id: string;
  event_id: string;
  storage_path: string;
  public_url: string;
  thumb_url?: string;
  original_url?: string;
  user_id: string;
  user_name?: string;
  likes_count: number;
  is_pickup: boolean;
  is_hidden?: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
}

class RichSoundEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createReverb(targetGain = 0.35) {
    if (!this.ctx) return null;
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.06;

    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.45;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3200;

    const wet = this.ctx.createGain();
    wet.gain.value = targetGain;

    delay.connect(feedback);
    feedback.connect(filter);
    filter.connect(delay);
    delay.connect(wet);
    wet.connect(this.ctx.destination);

    return delay;
  }

  playDrumroll(duration = 2.2) {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const steps = 38;
    const stepDuration = duration / steps;

    for (let i = 0; i < steps; i++) {
      const t = now + i * stepDuration;
      const progress = i / steps;
      const volume = 0.05 + Math.pow(progress, 2) * 0.45;

      const bufferSize = this.ctx.sampleRate * 0.04;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1200;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);

      const tone = this.ctx.createOscillator();
      const toneGain = this.ctx.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(140 + Math.random() * 20, t);
      toneGain.gain.setValueAtTime(volume * 0.4, t);
      toneGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      tone.connect(toneGain);
      toneGain.connect(this.ctx.destination);
      tone.start(t);
      tone.stop(t + 0.04);
    }
  }

  private playBrassNote(freq: number, startTime: number, dur: number, maxVol = 0.25, reverbNode: any) {
    if (!this.ctx) return;

    [-4, 4].forEach((detune) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime(detune, startTime);

      filter.type = 'lowpass';
      filter.Q.value = 2.5;
      filter.frequency.setValueAtTime(600, startTime);
      filter.frequency.exponentialRampToValueAtTime(4500, startTime + 0.08);
      filter.frequency.exponentialRampToValueAtTime(2200, startTime + dur);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(maxVol, startTime + 0.05);
      gain.gain.setValueAtTime(maxVol * 0.85, startTime + dur - 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);
      if (reverbNode) gain.connect(reverbNode);

      osc.start(startTime);
      osc.stop(startTime + dur + 0.15);
    });
  }

  private playCymbal(startTime: number, reverbNode: any) {
    if (!this.ctx) return;
    const dur = 2.5;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6500;
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    if (reverbNode) gain.connect(reverbNode);

    noise.start(startTime);
  }

  private playTimpani(startTime: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, startTime);
    osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.4);

    gain.gain.setValueAtTime(0.6, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.65);
  }

  playFanfare() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + 0.05;
    const reverb = this.createReverb(0.4);

    this.playBrassNote(523.25, now, 0.12, 0.25, reverb);
    this.playBrassNote(659.25, now + 0.14, 0.12, 0.25, reverb);
    this.playBrassNote(783.99, now + 0.28, 0.14, 0.28, reverb);

    const chordTime = now + 0.44;
    const chordDuration = 2.4;

    [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
      this.playBrassNote(freq, chordTime, chordDuration, 0.2, reverb);
    });

    this.playCymbal(chordTime, reverb);
    this.playTimpani(chordTime);
  }
}

const sounds = new RichSoundEngine();

export default function ProjectorLivePage() {
  const params = useParams();
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [newPostAlert, setNewPostAlert] = useState<Photo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [guestUrl, setGuestUrl] = useState('');

  const [isCeremonyOpen, setIsCeremonyOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<number>(3);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGuestUrl(`${window.location.origin}/${eventId}`);
    }
  }, [eventId]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const initEvent = async () => {
      const { data } = await supabase.from('events').select('id, title').eq('id', eventId).single();
      if (data) setEventData(data);
    };
    initEvent();

    const fetchPhotos = async () => {
      const { data } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (data) setPhotos(data as Photo[]);
    };
    fetchPhotos();

    const channel = supabase
      .channel(`rt_projector_${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        (payload) => {
          const newPhoto = payload.new as Photo;
          if (payload.eventType === 'INSERT') {
            if (newPhoto.event_id === eventId) {
              setPhotos((prev) => [newPhoto, ...prev]);
              if (!newPhoto.is_hidden) {
                setNewPostAlert(newPhoto);
                setTimeout(() => setNewPostAlert(null), 5000);
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            if (newPhoto.event_id === eventId) {
              setPhotos((prev) => prev.map((p) => (p.id === newPhoto.id ? newPhoto : p)));
            }
          } else if (payload.eventType === 'DELETE') {
            setPhotos((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const activePhotos = useMemo(() => {
    return photos.filter((p) => !p.is_hidden);
  }, [photos]);

  const slideshowPhotos = useMemo(() => {
    if (activePhotos.length === 0) return [];
    const pickups = activePhotos.filter((p) => p.is_pickup);
    return pickups.length > 0 ? pickups : activePhotos;
  }, [activePhotos]);

  useEffect(() => {
    if (slideshowPhotos.length <= 1 || isCeremonyOpen) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideshowPhotos.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [slideshowPhotos.length, isCeremonyOpen]);

  const rankingPhotos = useMemo(() => {
    return [...activePhotos].sort((a, b) => b.likes_count - a.likes_count).slice(0, 3);
  }, [activePhotos]);

  const latestPhotos = useMemo(() => {
    return activePhotos.slice(0, 4);
  }, [activePhotos]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const fireConfetti = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!(window as any).confetti) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
      document.body.appendChild(script);
      await new Promise((resolve) => { script.onload = resolve; });
    }
    const confetti = (window as any).confetti;
    if (confetti) {
      confetti({
        particleCount: 150,
        spread: 130,
        origin: { y: 0.6 },
        colors: ['#fbbf24', '#f59e0b', '#ec4899', '#ffffff'],
      });
    }
  }, []);

  const handleSelectStep = (step: number) => {
    setCeremonyStep(step);
    if (isSoundEnabled) {
      sounds.playDrumroll(1.2);
    }
    if (step === 1) {
      setTimeout(() => {
        fireConfetti();
        if (isSoundEnabled) sounds.playFanfare();
      }, 400);
    }
  };

  const handleNextStep = () => {
    if (ceremonyStep === 3) handleSelectStep(2);
    else if (ceremonyStep === 2) handleSelectStep(1);
  };

  const handlePrevStep = () => {
    if (ceremonyStep === 1) handleSelectStep(2);
    else if (ceremonyStep === 2) handleSelectStep(3);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCeremonyOpen) return;
      if (e.key === 'ArrowLeft') handlePrevStep();
      if (e.key === 'ArrowRight' || e.key === ' ') handleNextStep();
      if (e.key === 'Escape') setIsCeremonyOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCeremonyOpen, ceremonyStep]);

  const currentSlide = slideshowPhotos[currentIndex] || activePhotos[0];
  const ceremonyTargetPhoto = rankingPhotos[ceremonyStep - 1];

  return (
    <div className="w-screen h-screen bg-zinc-950 text-white flex flex-col overflow-hidden select-none font-sans">
      <header className="h-16 px-8 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-serif italic text-2xl tracking-wider font-light text-zinc-100">
            {eventData.title}
          </h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium ml-2">
            LIVE SCREEN
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              setCeremonyStep(3);
              setIsCeremonyOpen(true);
              if (isSoundEnabled) sounds.playDrumroll(1.2);
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-black rounded-xl text-sm flex items-center space-x-2 shadow-xl shadow-amber-500/20 active:scale-95 transition"
          >
            <Trophy className="w-4 h-4" />
            <span>🏆 表彰式・ランキング発表</span>
          </button>

          <button
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className={`p-2 rounded-lg border transition ${
              isSoundEnabled ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
            }`}
            title={isSoundEnabled ? '効果音 ON' : '効果音 OFF'}
          >
            {isSoundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <span className="text-sm text-zinc-400">
            投稿枚数: <strong className="text-white text-base">{activePhotos.length}</strong> 枚
          </span>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition text-zinc-300"
            title="全画面表示"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        <div className="col-span-8 h-full relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl flex items-center justify-center">
          {currentSlide ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-30 scale-110 transition-all duration-1000"
                style={{ backgroundImage: `url(${currentSlide.public_url})` }}
              />

              <img
                key={currentSlide.id}
                src={currentSlide.original_url || currentSlide.public_url}
                alt="Slideshow"
                className="relative z-10 max-h-full max-w-full object-contain rounded-2xl shadow-2xl animate-in fade-in duration-700"
              />

              <div className="absolute bottom-8 left-8 z-20 flex items-center space-x-3 bg-black/70 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10">
                {currentSlide.is_pickup && (
                  <span className="flex items-center space-x-1 text-amber-400 text-sm font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>新郎新婦 Pickup</span>
                  </span>
                )}
                <span className="text-sm text-zinc-200 font-medium">
                  📸 <strong>{currentSlide.user_name || 'ゲスト'}</strong> 様
                </span>
                <div className="flex items-center space-x-1.5 text-pink-400 text-sm font-bold pl-2 border-l border-white/20">
                  <Heart className="w-4 h-4 fill-pink-500" />
                  <span>{currentSlide.likes_count}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-zinc-600">
              <p className="font-serif italic text-2xl mb-2">Waiting for photos...</p>
              <p className="text-sm">QRコードから最初の写真を投稿してください</p>
            </div>
          )}

          {newPostAlert && (
            <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-lg flex flex-col items-center justify-center p-6 animate-in zoom-in-90 fade-in duration-300">
              <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-zinc-950 font-black text-sm px-5 py-1.5 rounded-full mb-3 shadow-xl flex items-center space-x-2">
                <Sparkles className="w-4 h-4" />
                <span>NEW PHOTO BY {newPostAlert.user_name || 'ゲスト'}！</span>
