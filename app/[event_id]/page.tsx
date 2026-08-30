'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Menu,
  X,
  Heart,
  CheckCircle2,
  Download,
  Camera,
  Trophy,
  Sparkles,
  User,
  Images,
  Loader2,
  Trash2,
  Star,
  Monitor,
  Lock,
  Unlock,
  QrCode,
  Copy,
  ChevronLeft,
  ChevronRight,
  Archive,
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
const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder', {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

interface Photo {
  id: string;
  event_id: string;
  storage_path: string;
  public_url: string;
  thumb_url?: string;
  original_url?: string;
  is_hd_ready?: boolean;
  user_id: string;
  likes_count: number;
  is_pickup: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
  host_pin: string;
}

type FilterType = 'ranking' | 'pickup' | 'mine' | null;

const createThumbnailBlob = (file: File, maxDimension = 600, quality = 0.7): Promise<Blob> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(file);
      return;
    }
    const img = document.createElement('img');
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

export default function EventPhotoGalleryPage() {
  const params = useParams();
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap', host_pin: '1234' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isHostMode, setIsHostMode] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  // 1. 端末固有UUIDの管理といいね同期
  useEffect(() => {
    let localUserId = localStorage.getItem('wedding_guest_uuid');
    if (!localUserId) {
      localUserId = crypto.randomUUID();
      localStorage.setItem('wedding_guest_uuid', localUserId);
    }
    setUserId(localUserId);

    const cachedSaves = localStorage.getItem(`saves_${eventId}`);
    if (cachedSaves) {
      try {
        setSavedPhotoIds(JSON.parse(cachedSaves));
      } catch {
        setSavedPhotoIds([]);
      }
    }

    const hostSession = sessionStorage.getItem(`host_auth_${eventId}`);
    if (hostSession === 'true') setIsHostMode(true);

    const loadUserLikes = async () => {
      const { data, error } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('event_id', eventId)
        .eq('user_id', localUserId);

      if (!error && data) {
        const likedIds = data.map((item) => String(item.photo_id));
        setMyLikedPhotoIds(likedIds);
        localStorage.setItem(`likes_${eventId}`, JSON.stringify(likedIds));
      }
    };
    loadUserLikes();
  }, [eventId]);

  // 2. イベント情報＆写真取得とRealtime購読
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const initEvent = async () => {
      const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (data) {
        setEventData(data);
      } else {
        const defaultEvt = { id: eventId, title: 'Wedding Snap', host_pin: '1234' };
        await supabase.from('events').upsert(defaultEvt);
        setEventData(defaultEvt);
      }
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
      .channel(`rt_photos_${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        (payload) => {
          const newRow = payload.new as Photo;
          const oldRow = payload.old as Photo;

          if (payload.eventType === 'INSERT') {
            if (newRow && newRow.event_id === eventId) {
              setPhotos((prev) => {
                const exists = prev.some((p) => p.id === newRow.id);
                return exists ? prev : [newRow, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            if (newRow && newRow.event_id === eventId) {
              setPhotos((prev) =>
                prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              setPhotos((prev) => prev.filter((p) => p.id !== oldRow.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // 3. フィルタリング
  const filteredPhotos = useMemo(() => {
    const result = [...photos];
    if (activeFilter === 'ranking') {
      result.sort((a, b) => b.likes_count - a.likes_count);
    } else if (activeFilter === 'pickup') {
      return result.filter((p) => p.is_pickup);
    } else if (activeFilter === 'mine') {
      return result.filter((p) => p.user_id === userId);
    }
    return result;
  }, [photos, activeFilter, userId]);

  // 4. いいねトグル
  const toggleLike = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isLiked = myLikedPhotoIds.includes(photoId);

    if (!isLiked && myLikedPhotoIds.length >= 3) {
      alert('いいねは1人最大3枚までです！');
      return;
    }

    const nextLikes = isLiked
      ? myLikedPhotoIds.filter((id) => id !== photoId)
      : [...myLikedPhotoIds, photoId];

    setMyLikedPhotoIds(nextLikes);
    localStorage.setItem(`likes_${eventId}`, JSON.stringify(nextLikes));

    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === photoId) {
          return {
            ...p,
            likes_count: isLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
          };
        }
        return p;
      })
    );

    try {
      const { data, error } = await supabase.rpc('toggle_photo_like_safe', {
        p_event_id: eventId,
        p_photo_id: photoId,
        p_user_id: userId,
      });

      if (error) {
        if (isLiked) {
          await supabase.from('photo_likes').delete().eq('photo_id', photoId).eq('user_id', userId);
        } else {
          await supabase.from('photo_likes').insert({ event_id: eventId, photo_id: photoId, user_id: userId });
        }
      } else if (data && typeof data.likes_count === 'number') {
        setPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, likes_count: data.likes_count } : p))
        );
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  // 5. 画像保存
  const handleDownload = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const downloadTargetUrl = photo.original_url || photo.public_url;
      const response = await fetch(downloadTargetUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `wedding_${photo.id.slice(0, 8)}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      if (!savedPhotoIds.includes(photo.id)) {
        const updatedSaves = [...savedPhotoIds, photo.id];
        setSavedPhotoIds(updatedSaves);
        localStorage.setItem(`saves_${eventId}`, JSON.stringify(updatedSaves));
      }
    } catch {
      alert('画像の保存に失敗しました');
    }
  };

  // 6. 画像アップロード
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setIsActionSheetOpen(false);

      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const thumbFileName = `thumb_${eventId}_${timestamp}_${rand}.jpg`;
      const originalFileName = `hd_${eventId}_${timestamp}_${rand}.jpg`;

      const thumbBlob = await createThumbnailBlob(file, 600, 0.7);
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from('wedding-photos')
        .upload(thumbFileName, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (thumbError) throw new Error(`サムネイル送信失敗: ${thumbError.message}`);

      const {
        data: { publicUrl: thumbPublicUrl },
      } = supabase.storage.from('wedding-photos').getPublicUrl(thumbData.path);

      const { data: insertedPhoto, error: dbError } = await supabase
        .from('photos')
        .insert({
          event_id: eventId,
          storage_path: thumbData.path,
          public_url: thumbPublicUrl,
          thumb_url: thumbPublicUrl,
          original_url: null,
          is_hd_ready: false,
          user_id: userId,
          likes_count: 0,
          is_pickup: false,
        })
        .select()
        .single();

      if (dbError) throw new Error(`DB保存失敗: ${dbError.message}`);

      setIsUploading(false);

      (async () => {
        try {
          const { data: hdData, error: hdError } = await supabase.storage
            .from('wedding-photos')
            .upload(originalFileName, file, {
              contentType: file.type || 'image/jpeg',
              upsert: true,
            });

          if (!hdError && hdData) {
            const {
              data: { publicUrl: hdPublicUrl },
            } = supabase.storage.from('wedding-photos').getPublicUrl(hdData.path);

            await supabase
              .from('photos')
              .update({
                original_url: hdPublicUrl,
                public_url: hdPublicUrl,
                is_hd_ready: true,
              })
              .eq('id', insertedPhoto.id);
          }
        } catch (bgErr) {
          console.error('HD Upload Error:', bgErr);
        }
      })();
    } catch (err: any) {
      alert(err.message || 'アップロードに失敗しました');
      setIsUploading(false);
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (albumInputRef.current) albumInputRef.current.value = '';
    }
  };

  // 7. ホスト専用操作
  const handleTogglePickup = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !photo.is_pickup;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_pickup: newStatus } : p)));
    await supabase.from('photos').update({ is_pickup: newStatus }).eq('id', photo.id);
  };

  const handleDeletePhoto = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('この写真を削除しますか？（復元できません）')) return;

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (previewIndex !== null) setPreviewIndex(null);
    await supabase.from('photos').delete().eq('id', photo.id);
  };

  const handleDownloadAllZip = async () => {
    if (photos.length === 0) {
      alert('ダウンロード可能な写真がありません');
      return;
    }
    if (!confirm(`全 ${photos.length} 枚の高画質写真をZIP形式で一括保存しますか？`)) return;

    try {
      setIsZipping(true);
      setZipProgress(0);

      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.body.appendChild(script);
        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const folder = zip.folder(`wedding_photos_${eventId}`);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const targetUrl = photo.original_url || photo.public_url;
        try {
          const res = await fetch(targetUrl);
          const blob = await res.blob();
          folder.file(`photo_${i + 1}_${photo.id.slice(0, 6)}.jpg`, blob);
        } catch (e) {
          console.error('Fetch error for zip:', photo.id, e);
        }
        setZipProgress(Math.round(((i + 1) / photos.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${eventData.title}_photos.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      alert('ZIPファイルのダウンロードが完了しました！');
    } catch (err) {
      alert('ZIPの作成に失敗しました');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === eventData.host_pin) {
      setIsHostMode(true);
      sessionStorage.setItem(`host_auth_${eventId}`, 'true');
      setIsPinModalOpen(false);
      setIsDrawerOpen(false);
      setPinInput('');
    } else {
      alert('PINコードが正しくありません');
    }
  };

  const handleLogoutHost = () => {
    setIsHostMode(false);
    sessionStorage.removeItem(`host_auth_${eventId}`);
    setIsDrawerOpen(false);
  };

  const currentPreviewPhoto = previewIndex !== null ? filteredPhotos[previewIndex] : null;

  const handlePrevPreview = useCallback(() => {
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1));
  }, [previewIndex, filteredPhotos.length]);

  const handleNextPreview = useCallback(() => {
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0));
  }, [previewIndex, filteredPhotos.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 40) handleNextPreview();
    if (distance < -40) handlePrevPreview();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
        {isHostMode && (
          <div className="sticky top-0 z-50 bg-amber-500 text-zinc-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow">
            <span className="flex items-center space-x-1">
              <Unlock className="w-3.5 h-3.5" />
              <span>ホスト管理者モード中</span>
            </span>
            <button onClick={handleLogoutHost} className="underline text-[11px]">
              終了
            </button>
          </div>
        )}

        <header className="sticky top-0 z-40 w-full bg-zinc-100/90 backdrop-blur-sm border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
          <div className="w-6" />
          <h1 className="font-serif italic text-[clamp(1.1rem,4.5vw,1.25rem)] tracking-wider text-zinc-800 select-none">
            {eventData.title}
          </h1>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-zinc-700 hover:text-zinc-950 p-1 active:scale-95 transition"
            aria-label="メニューを開く"
          >
            <Menu className="w-6 h-6" strokeWidth={1.5} />
          </button>
        </header>

        <section className="flex justify-between items-center w-full px-6 py-4">
          <button
            onClick={() => setActiveFilter(activeFilter === 'ranking' ? null : 'ranking')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'ranking' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Ranking
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'pickup' ? null : 'pickup')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'pickup' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <Sparkles className="w-5 h-5 text-indigo-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Pickup
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'mine' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <User className="w-5 h-5 text-emerald-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              mine
            </span>
          </button>
        </section>

        {filteredPhotos.length === 0 ? (
          <div className="w-full">
            <div className="grid grid-cols-3 gap-[1px] bg-zinc-200 w-full">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="w-full aspect-square bg-zinc-50 flex flex-col items-center justify-center text-zinc-300"
                >
                  <Images className="w-6 h-6 opacity-40 mb-1" strokeWidth={1.5} />
                  <span className="text-[10px] opacity-40">枠 {i + 1}</span>
                </div>
              ))}
            </div>
            <div className="py-8 text-center px-4">
              <p className="text-sm font-medium text-zinc-600 mb-1">写真がまだありません</p>
              <p className="text-xs text-zinc-400">
                右下のカメラボタンから写真を追加してください
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[1px] bg-zinc-200 w-full">
            {filteredPhotos.map((photo, index) => {
              const isLiked = myLikedPhotoIds.includes(photo.id);
              const isSaved = savedPhotoIds.includes(photo.id);
              const displayUrl = photo.thumb_url || photo.public_url;

              return (
                <div
                  key={photo.id}
                  onClick={() => setPreviewIndex(index)}
                  className="w-full aspect-square relative overflow-hidden bg-zinc-100 cursor-pointer select-none active:opacity-90 transform-gpu"
                >
                  <img
                    src={displayUrl}
                    alt="Wedding photo"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  <span className="absolute bottom-1.5 left-1.5 text-[clamp(0.65rem,2.5vw,0.75rem)] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] z-10 pointer-events-none">
                    {photo.likes_count}
                  </span>

                  {photo.is_pickup && (
                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow" />
                    </div>
                  )}

                  <button
                    onClick={(e) => toggleLike(photo.id, e)}
                    className="absolute bottom-1.5 right-1.5 z-20 p-1 active:scale-125 transition-transform"
                    aria-label="いいね"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isLiked
                          ? 'fill-pink-500 text-pink-500'
                          : 'text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
                      }`}
                    />
                  </button>

                  {isSaved && (
                    <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
                      <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white drop-shadow" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {currentPreviewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 animate-in fade-in duration-150"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="absolute inset-0" onClick={() => setPreviewIndex(null)} />

          <div className="relative w-full max-w-sm max-h-[85vh] flex flex-col items-center justify-between z-10">
            <div className="w-full flex items-center justify-between pb-2 text-white">
              <span className="text-xs font-mono font-medium text-zinc-400">
                {previewIndex !== null ? previewIndex + 1 : 1} / {filteredPhotos.length}
              </span>
              <button
                onClick={() => setPreviewIndex(null)}
                className="p-2 rounded-full bg-white/10 text-white active:scale-95 transition-transform"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative w-full max-h-[60vh] flex items-center justify-center rounded-2xl overflow-hidden bg-black shadow-2xl">
              <button
                onClick={handlePrevPreview}
                className="hidden sm:flex absolute left-2 z-20 p-2 rounded-full bg-black/50 text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <img
                key={currentPreviewPhoto.id}
                src={currentPreviewPhoto.original_url || currentPreviewPhoto.thumb_url || currentPreviewPhoto.public_url}
                alt="Enlarged photo"
                className="w-auto h-auto max-h-[60vh] max-w-full object-contain rounded-2xl transform-gpu"
              />

              <button
                onClick={handleNextPreview}
                className="hidden sm:flex absolute right-2 z-20 p-2 rounded-full bg-black/50 text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            <div className="w-full mt-4 bg-zinc-900 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-2xl border border-white/10">
              <button
                onClick={() => toggleLike(currentPreviewPhoto.id)}
                className="flex items-center space-x-2 text-white active:scale-95 transition-transform"
              >
                <Heart
                  className={`w-6 h-6 ${
                    myLikedPhotoIds.includes(currentPreviewPhoto.id)
                      ? 'fill-pink-500 text-pink-500'
                      : 'text-zinc-300'
                  }`}
                />
                <span className="font-bold text-sm text-zinc-100">{currentPreviewPhoto.likes_count}</span>
              </button>

              <button
                onClick={() => handleDownload(currentPreviewPhoto)}
                className="flex items-center space-x-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl text-xs font-semibold transition-transform"
              >
                <Download className="w-4 h-4" />
                <span>{savedPhotoIds.includes(currentPreviewPhoto.id) ? '保存済み' : '端末に保存'}</span>
              </button>

              {isHostMode && (
                <div className="flex items-center space-x-2 pl-2 border-l border-white/20">
                  <button
                    onClick={() => handleTogglePickup(currentPreviewPhoto)}
                    className={`p-2 rounded-xl active:scale-95 transition-transform ${
                      currentPreviewPhoto.is_pickup
                        ? 'bg-amber-400 text-zinc-950 font-bold'
                        : 'bg-white/15 text-white'
                    }`}
                    title="Pickup"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePhoto(currentPreviewPhoto)}
                    className="p-2 rounded-xl bg-red-500 text-white active:scale-95 transition-transform"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      <button
        disabled={isUploading}
        onClick={() => setIsActionSheetOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border border-zinc-100 active:scale-90 transition-transform transform-gpu ${
          isUploading ? 'opacity-70' : ''
        }`}
        aria-label="写真を追加"
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 text-zinc-900 animate-spin" />
        ) : (
          <Camera className="w-7 h-7 text-zinc-900" strokeWidth={1.5} />
        )}
      </button>

      {isActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/50">
          <div className="absolute inset-0" onClick={() => setIsActionSheetOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl z-10 space-y-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] animate-in slide-in-from-bottom duration-150">
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-2" />
            <h3 className="text-center font-bold text-zinc-800 text-sm mb-4">写真を追加する</h3>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-900 text-white rounded-2xl font-medium flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Camera className="w-5 h-5" />
              <span>写真を撮影する</span>
            </button>

            <button
              onClick={() => albumInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-100 text-zinc-800 rounded-2xl font-medium flex items-center justify-center space-x-2 active:scale-98 transition"
            >
              <Images className="w-5 h-5 text-zinc-600" />
              <span>アルバムから選択</span>
            </button>

            <button
              onClick={() => setIsActionSheetOpen(false)}
              className="w-full py-3 text-zinc-400 font-medium text-sm active:text-zinc-600 transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="relative w-[75%] max-w-[300px] h-full bg-white shadow-2xl p-6 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <h2 className="font-serif italic font-bold text-zinc-800 text-lg">Menu</h2>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-800"
                >
                  <X className="w-6 h-6" strokeWidth={1.5} />
                </button>
              </div>

              <nav className="mt-6 space-y-3">
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsQrModalOpen(true);
                  }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  <QrCode className="w-5 h-5 text-zinc-500" />
                  <span>参加用QRコード</span>
                </button>

                <a
                  href={`/${eventId}/projector`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  <Monitor className="w-5 h-5 text-indigo-500" />
                  <span>プロジェクター投影画面</span>
                </a>

                {isHostMode && (
                  <button
                    disabled={isZipping}
                    onClick={handleDownloadAllZip}
                    className="flex items-center space-x-3 text-amber-600 w-full py-2.5 px-2 text-left font-medium active:bg-amber-50 rounded-xl"
                  >
                    <Archive className="w-5 h-5" />
                    <span>{isZipping ? `ZIP作成中 (${zipProgress}%)` : '全写真一括ダウンロード'}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    if (isHostMode) {
                      handleLogoutHost();
                    } else {
                      setIsPinModalOpen(true);
                    }
                  }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  {isHostMode ? (
                    <>
                      <Unlock className="w-5 h-5 text-amber-500" />
                      <span>ホスト管理を終了</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5 text-zinc-500" />
                      <span>ホスト管理設定</span>
                    </>
                  )}
                </button>
              </nav>
            </div>

            <div className="text-xs text-zinc-400 space-y-1">
              <p>Guest ID: {userId.slice(0, 8)}...</p>
              <p>Wedding Snap v1.0.0</p>
            </div>
          </aside>
        </div>
      )}

      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4">
            <div className="text-center">
              <Lock className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <h3 className="font-bold text-zinc-800 text-base">ホスト管理認証</h3>
              <p className="text-xs text-zinc-400 mt-1">4桁のホストPINを入力してください</p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PINコード (初期: 1234)"
                className="w-full text-center tracking-widest text-2xl font-bold py-3 bg-zinc-100 rounded-2xl border-none focus:ring-2 focus:ring-zinc-800"
                autoFocus
              />

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="w-1/2 py-3 text-sm font-medium text-zinc-500 bg-zinc-100 rounded-2xl"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 text-sm font-medium text-white bg-zinc-900 rounded-2xl shadow"
                >
                  ロック解除
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-zinc-800 text-sm">会場配布用QRコード</h3>
              <button onClick={() => setIsQrModalOpen(false)} className="p-1 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 rounded-2xl flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.href : ''
                )}`}
                alt="QR Code"
                className="w-48 h-48 rounded-lg"
              />
            </div>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.href);
                  alert('URLをコピーしました！');
                }
              }}
              className="w-full py-3 bg-zinc-900 text-white rounded-2xl text-xs font-medium flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Copy className="w-4 h-4" />
              <span>参加URLをコピー</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
