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
  Printer,
  EyeOff,
  AlertCircle,
  HelpCircle,
  Plus,
  Minus,
  Sliders,
  WifiOff,
  Check,
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
  is_hd_ready?: boolean;
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
  host_pin: string;
  is_locked?: boolean;
  photo_limit?: number;
  archive_days?: number;
}

type FilterType = 'ranking' | 'pickup' | 'mine' | null;

// HEIC変換 ＆ サムネイル生成
const convertAndResizeImage = async (file: File): Promise<{ thumbBlob: Blob; originalBlob: Blob }> => {
  let workingFile: Blob = file;

  // 1. iPhoneのHEIC形式を自動検知してJPEGに変換
  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic';
  if (isHeic && typeof window !== 'undefined') {
    try {
      if (!(window as any).heic2any) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js';
        document.body.appendChild(script);
        await new Promise((res) => { script.onload = res; });
      }
      const heic2any = (window as any).heic2any;
      if (heic2any) {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        workingFile = Array.isArray(converted) ? converted[0] : converted;
      }
    } catch (e) {
      console.warn('HEIC conversion fallback:', e);
    }
  }

  // 2. 高速サムネイルBlob生成
  const thumbBlob = await new Promise<Blob>((resolve) => {
    if (typeof window === 'undefined') return resolve(workingFile);
    const img = document.createElement('img');
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDim = 600;
      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(workingFile);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || workingFile), 'image/jpeg', 0.75);
    };
    img.onerror = () => resolve(workingFile);
    img.src = URL.createObjectURL(workingFile);
  });

  return { thumbBlob, originalBlob: workingFile };
};

export default function EventPhotoGalleryPage() {
  const params = useParams();
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap', host_pin: '1234', is_locked: false, photo_limit: 10 });
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
  
  // アップロード・レートリミット
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<{ file: File; name: string }[]>([]);

  // モーダル類
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isZipModalOpen, setIsZipModalOpen] = useState(false);
  const [zipFilterType, setZipFilterType] = useState<'all' | 'pickup' | 'top10'>('all');
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const [isHostMode, setIsHostMode] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [bouncingLikeId, setBouncingLikeId] = useState<string | null>(null);

  const touchStartX = useRef<number>(0);
  const touchStartTime = useRef<number>(0);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const fetchAllData = useCallback(async (currentUid: string) => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const { data: eventRow } = await supabase.from('events').select('*').eq('id', eventId).single();
    if (eventRow) setEventData(eventRow);

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

    fetchAllData(localUserId);
  }, [eventId, fetchAllData]);

  // オフライン・電波回復リトライリスナー
  useEffect(() => {
    const handleOnline = () => {
      if (offlineQueue.length > 0) {
        const item = offlineQueue[0];
        setOfflineQueue((prev) => prev.slice(1));
        executeUpload(item.file, item.name);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [offlineQueue]);

  // Realtime同期
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const channel = supabase
      .channel(`sync_room_${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (payload) => {
        const newRow = payload.new as Photo;
        const oldRow = payload.old as Photo;
        if (payload.eventType === 'INSERT' && newRow?.event_id === eventId) {
          setPhotos((prev) => (prev.some((p) => p.id === newRow.id) ? prev : [newRow, ...prev]));
        } else if (payload.eventType === 'UPDATE' && newRow?.event_id === eventId) {
          setPhotos((prev) => prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p)));
        } else if (payload.eventType === 'DELETE' && oldRow?.id) {
          setPhotos((prev) => prev.filter((p) => p.id !== oldRow.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) => {
        const newEvt = payload.new as EventData;
        if (newEvt?.id === eventId) setEventData((prev) => ({ ...prev, ...newEvt }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  const filteredPhotos = useMemo(() => {
    let result = photos.filter((p) => isHostMode || !p.is_hidden);
    if (activeFilter === 'ranking') result.sort((a, b) => b.likes_count - a.likes_count);
    else if (activeFilter === 'pickup') return result.filter((p) => p.is_pickup);
    else if (activeFilter === 'mine') return result.filter((p) => p.user_id === userId);
    return result;
  }, [photos, activeFilter, userId, isHostMode]);

  const myPhotosCount = useMemo(() => {
    return photos.filter((p) => p.user_id === userId).length;
  }, [photos, userId]);

  const currentPhotoLimit = eventData.photo_limit || 10;

  // アップロード処理（HEIC変換 + リトライキュー + 3秒レートリミット）
  const executeUpload = async (file: File, nameToUse: string) => {
    if (isCoolingDown) {
      alert('連続投稿を防ぐため、少し待ってから投稿してください（3秒間隔）');
      return;
    }

    if (myPhotosCount >= currentPhotoLimit) {
      alert(`投稿枚数の上限（最大 ${currentPhotoLimit} 枚）に達しています。\n「mine」タブから不要な写真を削除して入れ替えてください。`);
      return;
    }

    if (!navigator.onLine) {
      setOfflineQueue((prev) => [...prev, { file, name: nameToUse }]);
      alert('現在オフラインです。電波が回復した際に自動でアップロードされます。');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgressText('最適化中...');
      setIsActionSheetOpen(false);

      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const thumbFileName = `thumb_${eventId}_${timestamp}_${rand}.jpg`;
      const originalFileName = `hd_${eventId}_${timestamp}_${rand}.jpg`;

      const { thumbBlob, originalBlob } = await convertAndResizeImage(file);

      setUploadProgressText('送信中...');
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from('wedding-photos')
        .upload(thumbFileName, thumbBlob, { contentType: 'image/jpeg', upsert: true });

      if (thumbError) throw new Error(thumbError.message);

      const { data: { publicUrl: thumbPublicUrl } } = supabase.storage.from('wedding-photos').getPublicUrl(thumbData.path);

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
          is_hidden: false,
        })
        .select()
        .single();

      if (dbError) throw new Error(dbError.message);

      // 3秒レートリミット
      setIsCoolingDown(true);
      setTimeout(() => setIsCoolingDown(false), 3000);

      setIsUploading(false);
      setUploadProgressText('');

      // バックグラウンドHD送信
      (async () => {
        try {
          const { data: hdData } = await supabase.storage
            .from('wedding-photos')
            .upload(originalFileName, originalBlob, { contentType: 'image/jpeg', upsert: true });

          if (hdData) {
            const { data: { publicUrl: hdPublicUrl } } = supabase.storage.from('wedding-photos').getPublicUrl(hdData.path);
            await supabase.from('photos').update({ original_url: hdPublicUrl, public_url: hdPublicUrl, is_hd_ready: true }).eq('id', insertedPhoto.id);
          }
        } catch (e) {
          console.error('HD Upload Error:', e);
        }
      })();
    } catch (err: any) {
      alert(`送信に失敗しました: ${err.message || '電波状況をご確認ください'}`);
      setOfflineQueue((prev) => [...prev, { file, name: nameToUse }]);
      setIsUploading(false);
      setUploadProgressText('');
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (albumInputRef.current) albumInputRef.current.value = '';
    }
  };

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

  const toggleLike = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (eventData.is_locked) return alert('現在、いいねの投票は締め切られています');

    const isLiked = myLikedPhotoIds.includes(photoId);
    if (!isLiked && myLikedPhotoIds.length >= 3) return alert('いいねは1人最大3枚までです！');

    setBouncingLikeId(photoId);
    setTimeout(() => setBouncingLikeId(null), 300);

    const nextLikes = isLiked ? myLikedPhotoIds.filter((id) => id !== photoId) : [...myLikedPhotoIds, photoId];
    setMyLikedPhotoIds(nextLikes);
    localStorage.setItem(`likes_${eventId}`, JSON.stringify(nextLikes));

    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, likes_count: isLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1 } : p)));

    try {
      if (isLiked) {
        await supabase.from('photo_likes').delete().eq('event_id', eventId).eq('photo_id', photoId).eq('user_id', userId);
      } else {
        await supabase.from('photo_likes').insert({ event_id: eventId, photo_id: photoId, user_id: userId });
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

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

  // ゲスト本人の写真削除（写真入れ替え対応）
  const handleDeleteMyPhoto = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (photo.user_id !== userId && !isHostMode) return;
    if (!confirm('この写真を削除して枠を空けますか？（他の写真を投稿できるようになります）')) return;

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (previewIndex !== null) setPreviewIndex(null);
    await supabase.from('photos').delete().eq('id', photo.id);
  };

  // ホスト機能
  const handleUpdateLimit = async (delta: number) => {
    const nextLimit = Math.max(1, Math.min(30, (eventData.photo_limit || 10) + delta));
    setEventData((prev) => ({ ...prev, photo_limit: nextLimit }));
    await supabase.from('events').update({ photo_limit: nextLimit }).eq('id', eventId);
  };

  const handleToggleLock = async () => {
    const nextLocked = !eventData.is_locked;
    setEventData((prev) => ({ ...prev, is_locked: nextLocked }));
    await supabase.from('events').update({ is_locked: nextLocked }).eq('id', eventId);
  };

  const handleTogglePickup = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !photo.is_pickup;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_pickup: newStatus } : p)));
    await supabase.from('photos').update({ is_pickup: newStatus }).eq('id', photo.id);
  };

  const handleToggleHide = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newHidden = !photo.is_hidden;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_hidden: newHidden } : p)));
    await supabase.from('photos').update({ is_hidden: newHidden }).eq('id', photo.id);
  };

  // 絞り込み付きZIP一括ダウンロード
  const executeDownloadZip = async () => {
    let targetList = [...photos];
    if (zipFilterType === 'pickup') {
      targetList = targetList.filter((p) => p.is_pickup);
    } else if (zipFilterType === 'top10') {
      targetList = targetList.sort((a, b) => b.likes_count - a.likes_count).slice(0, 10);
    }

    if (targetList.length === 0) return alert('対象の写真がありません');

    try {
      setIsZipping(true);
      setZipProgress(0);
      setIsZipModalOpen(false);

      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.body.appendChild(script);
        await new Promise((res) => { script.onload = res; });
      }

      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const folder = zip.folder(`${eventData.title}_${zipFilterType}`);

      for (let i = 0; i < targetList.length; i++) {
        const photo = targetList[i];
        const targetUrl = photo.original_url || photo.public_url;
        try {
          const res = await fetch(targetUrl);
          const blob = await res.blob();
          const uploader = photo.user_name ? `_${photo.user_name}` : '';
          folder.file(`photo_${i + 1}${uploader}_${photo.id.slice(0, 6)}.jpg`, blob);
        } catch (e) {
          console.error('Fetch error:', e);
        }
        setZipProgress(Math.round(((i + 1) / targetList.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${eventData.title}_${zipFilterType}_photos.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      alert('ZIPダウンロードが完了しました！');
    } catch {
      alert('ZIPの作成に失敗しました');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const handleGenerateQrCard = () => {
    if (typeof window === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 12;
    ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

    ctx.fillStyle = '#18181B';
    ctx.font = 'italic 72px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('Wedding Photo Share', 600, 260);

    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#3F3F46';
    ctx.fillText(eventData.title, 600, 360);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#71717A';
    ctx.fillText('本日はご列席いただき誠にありがとうございます', 600, 460);
    ctx.fillText('皆さまが撮影した素敵な写真をぜひ共有してください', 600, 520);

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.href)}`;
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 350, 640, 500, 500);
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#18181B';
      ctx.fillText('QRコードをスマホのカメラで読み取って参加', 600, 1260);
      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#A1A1AA';
      ctx.fillText('アプリのインストールや面倒な登録は不要です', 600, 1340);

      const cardUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = cardUrl;
      link.download = `table_card_${eventId}.jpg`;
      link.click();
      alert('卓上案内カードを保存しました！印刷してご利用ください。');
    };
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

  const currentPhoto = previewIndex !== null ? filteredPhotos[previewIndex] : null;

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
    touchStartTime.current = Date.now();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = endX - touchStartX.current;
    const diffTime = Date.now() - touchStartTime.current;
    if (diffTime < 350 && Math.abs(diffX) > 30) {
      if (diffX < 0) handleNextPreview();
      else handlePrevPreview();
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex justify-center selection:bg-amber-100 font-sans antialiased text-zinc-800">
      <main className="w-full max-w-md min-h-screen bg-[#FDFCFB] relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6.5rem)] overflow-y-auto overflow-x-hidden border-x border-black/[0.04]">
        {/* ホストモード中バナー */}
        {isHostMode && (
          <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow-md">
            <span className="flex items-center space-x-1.5">
              <Unlock className="w-3.5 h-3.5" />
              <span>ホスト管理者モード（上限: {currentPhotoLimit}枚）</span>
            </span>
            <button onClick={handleLogoutHost} className="underline text-[11px] font-bold">
              終了
            </button>
          </div>
        )}

        {/* 投票締め切り告知 */}
        {eventData.is_locked && (
          <div className="bg-zinc-900 text-amber-300 text-xs font-bold px-4 py-2 flex items-center justify-center space-x-1.5 text-center shadow-md">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>いいね投票は締め切られました（閲覧・保存・削除は可能）</span>
          </div>
        )}

        {/* ヘッダー */}
        <header className="sticky top-0 z-40 w-full bg-[#FDFCFB]/90 backdrop-blur-md border-b border-black/[0.05] px-5 py-3.5 flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
          <div className="flex items-center space-x-1 text-xs text-zinc-500 font-medium">
            <span>投稿:</span>
            <strong className={`${myPhotosCount >= currentPhotoLimit ? 'text-amber-600' : 'text-zinc-900'} font-bold`}>
              {myPhotosCount}/{currentPhotoLimit}
            </strong>
          </div>

          <h1 className="font-serif italic text-[clamp(1.15rem,4.5vw,1.35rem)] tracking-wider text-zinc-900 select-none font-medium text-center truncate max-w-[50%]">
            {eventData.title}
          </h1>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsGuideModalOpen(true)}
              className="text-zinc-500 hover:text-zinc-900 p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition"
              title="使い方ガイド"
            >
              <HelpCircle className="w-5 h-5" strokeWidth={1.7} />
            </button>
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="text-zinc-700 hover:text-zinc-950 p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition"
              aria-label="メニューを開く"
            >
              <Menu className="w-6 h-6" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        {/* ナビゲーションカード */}
        <section className="flex justify-between items-center w-full px-6 py-4">
          <button
            onClick={() => setActiveFilter(activeFilter === 'ranking' ? null : 'ranking')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'ranking' ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md bg-amber-50/30' : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">Ranking</span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'pickup' ? null : 'pickup')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'pickup' ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md bg-indigo-50/30' : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <Sparkles className="w-5 h-5 text-indigo-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">Pickup</span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'mine' ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-50/30' : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <User className="w-5 h-5 text-emerald-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">mine ({myPhotosCount})</span>
          </button>
        </section>

        {/* 写真グリッド */}
        {filteredPhotos.length === 0 ? (
          <div className="w-full px-3">
            <div className="grid grid-cols-3 gap-2.5 w-full">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="w-full aspect-square rounded-2xl bg-black/[0.02] border border-dashed border-black/[0.08] flex flex-col items-center justify-center text-zinc-300">
                  <Camera className="w-6 h-6 opacity-30 mb-1" strokeWidth={1.5} />
                  <span className="text-[10px] opacity-40 font-mono">#{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="py-14 text-center px-4">
              <p className="text-sm font-bold text-zinc-700 mb-1">写真がありません</p>
              <p className="text-xs text-zinc-400">右下の「投稿する」ボタンから写真を追加してください</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 px-3 py-1 w-full">
            {filteredPhotos.map((photo, index) => {
              const isLiked = myLikedPhotoIds.includes(photo.id);
              const isSaved = savedPhotoIds.includes(photo.id);
              const isMine = photo.user_id === userId;
              const displayUrl = photo.thumb_url || photo.public_url;
              const isBouncing = bouncingLikeId === photo.id;

              return (
                <div
                  key={photo.id}
                  onClick={() => setPreviewIndex(index)}
                  className="w-full aspect-square relative rounded-2xl overflow-hidden bg-zinc-100 cursor-pointer select-none active:scale-[0.97] transition-all duration-200 shadow-sm hover:shadow border border-black/[0.04]"
                >
                  <img src={displayUrl} alt="Wedding photo" className="w-full h-full object-cover" loading="lazy" />

                  <div className="absolute bottom-1.5 left-1.5 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full flex items-center space-x-1 z-10 pointer-events-none">
                    <span className="text-[10px] font-bold text-white">{photo.likes_count}</span>
                  </div>

                  {photo.is_pickup && (
                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none drop-shadow-md">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    </div>
                  )}

                  {photo.is_hidden && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-red-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow">
                      非表示中
                    </div>
                  )}

                  {isHostMode && photo.user_name && !photo.is_hidden && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[9px] text-amber-300 font-bold max-w-[80%] truncate shadow-sm">
                      {photo.user_name}
                    </div>
                  )}

                  {/* 自分の写真マーク */}
                  {isMine && !isHostMode && !photo.is_pickup && !photo.is_hidden && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-emerald-600/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] text-white font-bold">
                      mine
                    </div>
                  )}

                  <button
                    onClick={(e) => toggleLike(photo.id, e)}
                    className={`absolute bottom-1.5 right-1.5 z-20 p-1.5 rounded-full bg-black/30 backdrop-blur-md transition-transform duration-200 ${
                      isBouncing ? 'scale-135' : 'active:scale-125'
                    }`}
                    aria-label="いいね"
                  >
                    <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                  </button>

                  {isSaved && (
                    <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none drop-shadow">
                      <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 全画面プレビューモーダル */}
      {currentPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none animate-in fade-in duration-150"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-full z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-zinc-300 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md border border-white/10">
                {previewIndex! + 1} / {filteredPhotos.length}
              </span>
              {isHostMode && (
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full font-bold backdrop-blur-md">
                  撮影者: {currentPhoto.user_name || 'ゲスト'} 様
                </span>
              )}
            </div>
            <button
              onClick={() => setPreviewIndex(null)}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-90 transition backdrop-blur-md border border-white/10"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
            <button onClick={handlePrevPreview} className="hidden sm:flex absolute left-4 z-20 p-3.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition backdrop-blur-md border border-white/10">
              <ChevronLeft className="w-6 h-6" />
            </button>

            <img
              key={currentPhoto.id}
              src={currentPhoto.original_url || currentPhoto.thumb_url || currentPhoto.public_url}
              alt="Full view"
              className="w-full h-full object-contain select-none animate-in zoom-in-95 duration-150"
            />

            <button onClick={handleNextPreview} className="hidden sm:flex absolute right-4 z-20 p-3.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition backdrop-blur-md border border-white/10">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* 下部操作バー */}
          <div className="w-full z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pb-[calc(env(safe-area-inset-bottom)+1.8rem)] flex items-center justify-between text-white">
            <button
              onClick={() => toggleLike(currentPhoto.id)}
              className={`flex items-center space-x-2 bg-white/15 hover:bg-white/25 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 transition ${
                bouncingLikeId === currentPhoto.id ? 'scale-110' : 'active:scale-95'
              }`}
            >
              <Heart className={`w-5 h-5 ${myLikedPhotoIds.includes(currentPhoto.id) ? 'fill-rose-500 text-rose-500' : 'text-zinc-200'}`} />
              <span className="font-bold text-sm text-white">{currentPhoto.likes_count}</span>
            </button>

            <button
              onClick={() => handleDownload(currentPhoto)}
              className="flex items-center space-x-1.5 px-5 py-2.5 bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md text-white rounded-2xl text-xs font-bold transition border border-white/10"
            >
              <Download className="w-4 h-4" />
              <span>{savedPhotoIds.includes(currentPhoto.id) ? '保存済み' : '高画質保存'}</span>
            </button>

            {/* 自分の写真削除（枠空け）ボタン */}
            {currentPhoto.user_id === userId && !isHostMode && (
              <button
                onClick={() => handleDeleteMyPhoto(currentPhoto)}
                className="p-2.5 rounded-2xl bg-red-600/80 hover:bg-red-600 backdrop-blur-md text-white active:scale-95 transition border border-red-500/50"
                title="この写真を削除して枠を空ける"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* ホスト専用メニュー */}
            {isHostMode && (
              <div className="flex items-center space-x-2 pl-2 border-l border-white/20">
                <button
                  onClick={() => handleTogglePickup(currentPhoto)}
                  className={`p-2.5 rounded-2xl backdrop-blur-md border border-white/10 transition ${
                    currentPhoto.is_pickup ? 'bg-amber-400 text-zinc-950 font-bold border-amber-300' : 'bg-white/15 text-white'
                  }`}
                  title="Pickup"
                >
                  <Star className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleToggleHide(currentPhoto)}
                  className={`p-2.5 rounded-2xl backdrop-blur-md border border-white/10 transition ${
                    currentPhoto.is_hidden ? 'bg-red-500 text-white' : 'bg-white/15 text-white'
                  }`}
                  title={currentPhoto.is_hidden ? '非表示解除' : 'プロジェクター非表示'}
                >
                  <EyeOff className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDeleteMyPhoto(currentPhoto)}
                  className="p-2.5 rounded-2xl bg-red-600/80 backdrop-blur-md text-white active:scale-95 transition border border-red-500/50"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 隠しインプット */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelected} className="hidden" />
      <input ref={albumInputRef} type="file" accept="image/*,.heic,.heif" onChange={handleFileSelected} className="hidden" />

      {/* FAB */}
      <button
        disabled={isUploading}
        onClick={() => setIsActionSheetOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 h-14 px-6 rounded-full bg-zinc-900 text-white shadow-[0_8px_25px_rgba(0,0,0,0.25)] flex items-center justify-center space-x-2 border border-zinc-700/80 active:scale-95 transition-all ${
          isUploading ? 'opacity-90' : ''
        }`}
        aria-label="写真を追加"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-xs font-bold tracking-wide">{uploadProgressText}</span>
          </>
        ) : (
          <>
            <Camera className="w-5 h-5 text-amber-400" strokeWidth={1.8} />
            <span className="text-xs font-bold tracking-wider">投稿する</span>
          </>
        )}
      </button>

      {/* 写真追加シート */}
      {isActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/50 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setIsActionSheetOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl z-10 space-y-3 pb-[calc(env(safe-area-inset-bottom)+1.8rem)] animate-in slide-in-from-bottom duration-150">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-2" />
            <div className="text-center pb-2">
              <h3 className="font-serif italic text-lg text-zinc-900">Share Your Memories</h3>
              <p className="text-xs text-zinc-400 mt-0.5">残り投稿枠: {Math.max(0, currentPhotoLimit - myPhotosCount)} 枚</p>
            </div>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Camera className="w-5 h-5 text-amber-400" />
              <span>カメラで写真を撮る</span>
            </button>

            <button
              onClick={() => albumInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-100 text-zinc-800 rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-98 transition"
            >
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span>アルバムから選ぶ (HEIC対応)</span>
            </button>

            <button onClick={() => setIsActionSheetOpen(false)} className="w-full py-3 text-zinc-400 font-medium text-xs active:text-zinc-600 transition">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* お名前入力モーダル */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs shadow-2xl space-y-5 border border-black/[0.04]">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200/60">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-900 text-base">お名前の登録</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">新郎新婦へ伝わるお名前やニックネームをご入力ください</p>
            </div>

            <form onSubmit={handleSaveNameAndUpload} className="space-y-4">
              <input
                type="text"
                maxLength={20}
                value={tempNameInput}
                onChange={(e) => setTempNameInput(e.target.value)}
                placeholder="例: 山田 / 新婦友人 あやか"
                className="w-full text-center text-sm font-bold py-3 bg-zinc-100 rounded-2xl border-none focus:ring-2 focus:ring-zinc-800"
                autoFocus
                required
              />

              <div className="flex space-x-2">
                <button type="button" onClick={() => { setIsNameModalOpen(false); setPendingUploadFile(null); }} className="w-1/3 py-3 text-xs font-bold text-zinc-500 bg-zinc-100 rounded-2xl">
                  中止
                </button>
                <button type="submit" className="w-2/3 py-3 text-xs font-bold text-white bg-zinc-900 rounded-2xl shadow">
                  決定して投稿
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 💡 オンボーディング使い方ガイドモーダル */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900 text-base flex items-center space-x-1.5">
                <HelpCircle className="w-5 h-5 text-amber-500" />
                <span>Wedding Snap の楽しみ方</span>
              </h3>
              <button onClick={() => setIsGuideModalOpen(false)} className="p-1 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-600">
              <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-100/60 flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</div>
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-0.5">写真を撮ってシェア</h4>
                  <p>右下の「投稿する」ボタンから、挙式・披露宴の想い出の瞬間をアップロード！（最大 {currentPhotoLimit} 枚）</p>
                </div>
              </div>

              <div className="p-3 bg-pink-50/60 rounded-2xl border border-pink-100/60 flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-pink-500 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</div>
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-0.5">素敵な写真に「いいね」投票</h4>
                  <p>他のゲストが撮った写真に「いいね（1人最大3票まで）」を投票しましょう！</p>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100/60 flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</div>
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-0.5">プロジェクターでリアルタイム上映</h4>
                  <p>投稿した写真は会場の巨大スクリーンに即時上映＆表彰式でベスト写真が発表されます！</p>
                </div>
              </div>
            </div>

            <button onClick={() => setIsGuideModalOpen(false)} className="w-full py-3 bg-zinc-900 text-white rounded-2xl font-bold text-xs shadow">
              わかりました！
            </button>
          </div>
        </div>
      )}

      {/* 📦 ZIP絞り込みダウンロードモーダル */}
      {isZipModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900 text-sm flex items-center space-x-1.5">
                <Archive className="w-4 h-4 text-amber-500" />
                <span>写真の一括保存</span>
              </h3>
              <button onClick={() => setIsZipModalOpen(false)} className="p-1 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setZipFilterType('all')}
                className={`w-full p-3 rounded-2xl text-left text-xs font-bold border transition flex items-center justify-between ${
                  zipFilterType === 'all' ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-500' : 'border-zinc-200 text-zinc-700'
                }`}
              >
                <span>① 全ての写真 ({photos.length} 枚)</span>
                {zipFilterType === 'all' && <Check className="w-4 h-4 text-amber-600" />}
              </button>

              <button
                onClick={() => setZipFilterType('pickup')}
                className={`w-full p-3 rounded-2xl text-left text-xs font-bold border transition flex items-center justify-between ${
                  zipFilterType === 'pickup' ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-500' : 'border-zinc-200 text-zinc-700'
                }`}
              >
                <span>② 新郎新婦Pickupのみ ({photos.filter((p) => p.is_pickup).length} 枚)</span>
                {zipFilterType === 'pickup' && <Check className="w-4 h-4 text-amber-600" />}
              </button>

              <button
                onClick={() => setZipFilterType('top10')}
                className={`w-full p-3 rounded-2xl text-left text-xs font-bold border transition flex items-center justify-between ${
                  zipFilterType === 'top10' ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-500' : 'border-zinc-200 text-zinc-700'
                }`}
              >
                <span>③ 人気ランキングTOP 10</span>
                {zipFilterType === 'top10' && <Check className="w-4 h-4 text-amber-600" />}
              </button>
            </div>

            <button
              onClick={executeDownloadZip}
              className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-bold text-xs shadow flex items-center justify-center space-x-1.5"
            >
              <Download className="w-4 h-4" />
              <span>ZIPをダウンロード開始</span>
            </button>
          </div>
        </div>
      )}

      {/* ドロワーメニュー */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          <aside className="relative w-[80%] max-w-[320px] h-full bg-[#FDFCFB] shadow-2xl p-6 flex flex-col justify-between z-10 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-black/[0.05]">
                <h2 className="font-serif italic font-bold text-zinc-900 text-xl tracking-wider">Menu</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="p-1 text-zinc-500 hover:text-zinc-800">
                  <X className="w-6 h-6" strokeWidth={1.5} />
                </button>
              </div>

              <div className="mt-4 p-3.5 bg-zinc-50/80 rounded-2xl flex items-center justify-between border border-black/[0.04]">
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Guest Name</p>
                  <p className="text-sm font-bold text-zinc-800">{userName || '未設定（ゲスト）'}</p>
                </div>
                <button onClick={() => { setTempNameInput(userName); setIsNameModalOpen(true); }} className="text-xs text-amber-600 font-bold underline">
                  変更
                </button>
              </div>

              <nav className="mt-6 space-y-2.5">
                <button
                  onClick={() => { setIsDrawerOpen(false); setIsGuideModalOpen(true); }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-3 text-left font-medium active:bg-zinc-100 rounded-xl transition text-sm"
                >
                  <HelpCircle className="w-5 h-5 text-amber-500" />
                  <span>使い方ガイド</span>
                </button>

                <button
                  onClick={() => { setIsDrawerOpen(false); setIsQrModalOpen(true); }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-3 text-left font-medium active:bg-zinc-100 rounded-xl transition text-sm"
                >
                  <QrCode className="w-5 h-5 text-zinc-500" />
                  <span>参加用QRコード</span>
                </button>

                <a
                  href={`/${eventId}/projector`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-3 text-left font-medium active:bg-zinc-100 rounded-xl transition text-sm"
                >
                  <Monitor className="w-5 h-5 text-indigo-500" />
                  <span>プロジェクター投影画面</span>
                </a>

                {/* ホスト専用メニュー */}
                {isHostMode && (
                  <>
                    <div className="pt-3 pb-1 border-t border-black/[0.05]">
                      <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider px-3">Host Admin Settings</p>
                    </div>

                    {/* 投稿枚数上限の増減 */}
                    <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-bold text-zinc-800">
                        <span>投稿枚数上限:</span>
                        <span className="text-amber-600 text-sm font-black">{currentPhotoLimit} 枚/人</span>
                      </div>
                      <div className="flex space-x-2 pt-1">
                        <button onClick={() => handleUpdateLimit(-1)} className="w-1/2 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold active:scale-95 flex items-center justify-center space-x-1">
                          <Minus className="w-3.5 h-3.5" />
                          <span>-1枚</span>
                        </button>
                        <button onClick={() => handleUpdateLimit(1)} className="w-1/2 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-bold active:scale-95 flex items-center justify-center space-x-1 shadow-sm">
                          <Plus className="w-3.5 h-3.5" />
                          <span>+1枚</span>
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleToggleLock}
                      className={`flex items-center space-x-3 w-full py-2.5 px-3 text-left font-bold rounded-xl text-sm transition ${
                        eventData.is_locked ? 'bg-amber-100/70 text-amber-950' : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <Lock className="w-5 h-5 text-amber-600" />
                      <span>{eventData.is_locked ? '投票ロック中（解除）' : 'いいね投票を締め切る'}</span>
                    </button>

                    <button
                      onClick={handleGenerateQrCard}
                      className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-3 text-left font-medium active:bg-zinc-100 rounded-xl transition text-sm"
                    >
                      <Printer className="w-5 h-5 text-zinc-600" />
                      <span>卓上案内カードを保存</span>
                    </button>

                    <button
                      disabled={isZipping}
                      onClick={() => { setIsDrawerOpen(false); setIsZipModalOpen(true); }}
                      className="flex items-center space-x-3 text-amber-700 w-full py-2.5 px-3 text-left font-bold active:bg-amber-50 rounded-xl text-sm transition"
                    >
                      <Archive className="w-5 h-5" />
                      <span>{isZipping ? `ZIP作成中 (${zipProgress}%)` : '写真一括ダウンロード（絞込可）'}</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    if (isHostMode) handleLogoutHost();
                    else setIsPinModalOpen(true);
                  }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-3 text-left font-medium active:bg-zinc-100 rounded-xl pt-2.5 border-t border-black/[0.05] transition text-sm"
                >
                  {isHostMode ? (
                    <>
                      <Unlock className="w-5 h-5 text-amber-500" />
                      <span>ホスト管理を終了</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5 text-zinc-500" />
                      <span>ホスト管理者ログイン</span>
                    </>
                  )}
                </button>
              </nav>
            </div>

            <div className="text-[11px] text-zinc-400 space-y-1 pt-6 font-mono">
              <p>Guest: {userId.slice(0, 8)}...</p>
              <p>Wedding Snap Pro v2.0</p>
            </div>
          </aside>
        </div>
      )}

      {/* ホストPINモーダル */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs shadow-2xl space-y-4">
            <div className="text-center">
              <Lock className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <h3 className="font-bold text-zinc-900 text-base">ホスト管理認証</h3>
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
                <button type="button" onClick={() => setIsPinModalOpen(false)} className="w-1/2 py-3 text-xs font-bold text-zinc-500 bg-zinc-100 rounded-2xl">
                  閉じる
                </button>
                <button type="submit" className="w-1/2 py-3 text-xs font-bold text-white bg-zinc-900 rounded-2xl shadow">
                  ロック解除
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QRコードモーダル */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-zinc-900 text-sm">会場配布用QRコード</h3>
              <button onClick={() => setIsQrModalOpen(false)} className="p-1 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 rounded-2xl flex justify-center border border-zinc-100">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
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
              className="w-full py-3 bg-zinc-900 text-white rounded-2xl text-xs font-bold flex items-center justify-center space-x-2 active:scale-98 transition shadow"
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
