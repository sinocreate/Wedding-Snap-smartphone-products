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
  UserCheck,
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
  realtime: { params: { eventsPerSecond: 20 } },
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
  user_name?: string;
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
    if (typeof window === 'undefined') return resolve(file);
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
      if (!ctx) return resolve(file);
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
  const [userName, setUserName] = useState<string>('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [tempNameInput, setTempNameInput] = useState('');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

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

  // リアルタイムカルーセルスワイプ用
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const fetchAllData = useCallback(async (currentUid: string) => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const { data: photosData } = await supabase
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (photosData) setPhotos(photosData as Photo[]);

    if (currentUid) {
      const { data: likesData } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('event_id', eventId)
        .eq('user_id', currentUid);

      if (likesData) {
        const likedIds = likesData.map((item) => String(item.photo_id));
        setMyLikedPhotoIds(likedIds);
        localStorage.setItem(`likes_${eventId}`, JSON.stringify(likedIds));
      }
    }
  }, [eventId]);

  // 1. 初期ロード & 名前復元
  useEffect(() => {
    let localUserId = localStorage.getItem('wedding_guest_uuid');
    if (!localUserId) {
      localUserId = crypto.randomUUID();
      localStorage.setItem('wedding_guest_uuid', localUserId);
    }
    setUserId(localUserId);

    const savedName = localStorage.getItem('wedding_guest_name') || '';
    setUserName(savedName);

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
    fetchAllData(localUserId);
  }, [eventId, fetchAllData]);

  // 2. Realtime 同期
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const channel = supabase
      .channel(`sync_room_${eventId}`)
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

    const interval = setInterval(() => {
      if (userId) fetchAllData(userId);
    }, 6000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [eventId, userId, fetchAllData]);

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
      if (isLiked) {
        await supabase
          .from('photo_likes')
          .delete()
          .eq('event_id', eventId)
          .eq('photo_id', photoId)
          .eq('user_id', userId);
      } else {
        await supabase
          .from('photo_likes')
          .insert({ event_id: eventId, photo_id: photoId, user_id: userId });
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

  // 6. 画像アップロード実処理
  const executeUpload = async (file: File, nameToUse: string) => {
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
          user_name: nameToUse || 'ゲスト',
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

  // ファイル選択トリガー（初回は名前入力を促す）
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!userName.trim()) {
      setPendingUploadFile(file);
      setIsNameModalOpen(true);
      setIsActionSheetOpen(false);
    } else {
      executeUpload(file, userName);
    }
  };

  const handleSaveNameAndUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = tempNameInput.trim() || 'ゲスト';
    setUserName(finalName);
    localStorage.setItem('wedding_guest_name', finalName);
    setIsNameModalOpen(false);

    if (pendingUploadFile) {
      executeUpload(pendingUploadFile, finalName);
      setPendingUploadFile(null);
    }
  };

  // 7. ホスト操作
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
    if (photos.length === 0) return alert('ダウンロード可能な写真がありません');
    if (!confirm(`全 ${photos.length} 枚の高画質写真をZIP形式で一括保存しますか？`)) return;

    try {
      setIsZipping(true);
      setZipProgress(0);

      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.body.appendChild(script);
        await new Promise((resolve) => { script.onload = resolve; });
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
          const uploader = photo.user_name ? `_${photo.user_name}` : '';
          folder.file(`photo_${i + 1}${uploader}_${photo.id.slice(0, 6)}.jpg`, blob);
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
    } catch {
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

  // カルーセル用：前後の写真
  const currentPhoto = previewIndex !== null ? filteredPhotos[previewIndex] : null;
  const prevPhoto = previewIndex !== null && filteredPhotos.length > 1
    ? filteredPhotos[(previewIndex - 1 + filteredPhotos.length) % filteredPhotos.length]
    : null;
  const nextPhoto = previewIndex !== null && filteredPhotos.length > 1
    ? filteredPhotos[(previewIndex + 1) % filteredPhotos.length]
    : null;

  // カルーセルスワイプハンドラ
  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartX.current = e.targetTouches[0].clientX;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || touchStartX.current === null || isAnimating) return;
    const currentX = e.targetTouches[0].clientX;
    const diff = currentX - touchStartX.current;
    setDragOffset(diff);
  };

  const onTouchEnd = () => {
    if (!isDragging.current || isAnimating) return;
    isDragging.current = false;

    const threshold = 60; // 切り替え判定のピクセル閾値

    if (dragOffset < -threshold && nextPhoto) {
      // 左スワイプ ➔ 次の写真へ流れるアニメーション
      setIsAnimating(true);
      setDragOffset(-window.innerWidth);
      setTimeout(() => {
        setPreviewIndex((prev) => (prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0));
        setDragOffset(0);
        setIsAnimating(false);
      }, 200);
    } else if (dragOffset > threshold && prevPhoto) {
      // 右スワイプ ➔ 前の写真へ流れるアニメーション
      setIsAnimating(true);
      setDragOffset(window.innerWidth);
      setTimeout(() => {
        setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1));
        setDragOffset(0);
        setIsAnimating(false);
      }, 200);
    } else {
      // 閾値未満 ➔ 元の位置へスムーズにバウンス
      setIsAnimating(true);
      setDragOffset(0);
      setTimeout(() => setIsAnimating(false), 200);
    }
    touchStartX.current = null;
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
        {/* ホストモード稼働中バナー */}
        {isHostMode && (
          <div className="sticky top-0 z-50 bg-amber-500 text-zinc-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow">
            <span className="flex items-center space-x-1">
              <Unlock className="w-3.5 h-3.5" />
              <span>ホスト管理者モード（投稿者確認・Pickup・一括DL可）</span>
            </span>
            <button onClick={handleLogoutHost} className="underline text-[11px]">
              終了
            </button>
          </div>
        )}

        {/* (1) 固定ヘッダー */}
        <header className="sticky top-0 z-40 w-full bg-zinc-100/90 backdrop-blur-sm border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
          <div className="w-6" />
          <h1 className="font-serif italic text-[clamp(1.1rem,4.5vw,1.25rem)] tracking-wider text-zinc-800 select-none">
            {eventData.title}
          </h1>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-zinc
