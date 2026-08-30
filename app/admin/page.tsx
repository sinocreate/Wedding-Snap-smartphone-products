'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Trash2,
  ExternalLink,
  Monitor,
  Copy,
  KeyRound,
  Calendar,
  Image as ImageIcon,
  Lock,
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

// マスター管理用パスワード（必要に応じて変更可能）
const ADMIN_SECRET = 'admin8888';

interface EventItem {
  id: string;
  title: string;
  host_pin: string;
  created_at: string;
  photo_count?: number;
}

export default function MasterAdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 新規イベント作成フォーム
  const [newId, setNewId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPin, setNewPin] = useState('1234');

  useEffect(() => {
    const auth = sessionStorage.getItem('master_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
      fetchEvents();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_SECRET) {
      setIsAuthenticated(true);
      sessionStorage.setItem('master_admin_auth', 'true');
      fetchEvents();
    } else {
      alert('管理者パスワードが違います');
    }
  };

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const { data: eventsData, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 各イベントの写真枚数を集計
      const eventsWithCount = await Promise.all(
        (eventsData || []).map(async (ev) => {
          const { count } = await supabase
            .from('photos')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', ev.id);
          return { ...ev, photo_count: count || 0 };
        })
      );

      setEvents(eventsWithCount);
    } catch (err: any) {
      alert(err.message || 'イベントの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (!cleanId) {
      alert('イベントID（半角英数字）を入力してください');
      return;
    }
    if (!newTitle.trim()) {
      alert('挙式名/イベント名を入力してください');
      return;
    }

    try {
      const { error } = await supabase.from('events').insert({
        id: cleanId,
        title: newTitle.trim(),
        host_pin: newPin.trim() || '1234',
      });

      if (error) throw error;

      alert(`イベント「${newTitle}」を発行しました！`);
      setNewId('');
      setNewTitle('');
      setNewPin('1234');
      fetchEvents();
    } catch (err: any) {
      alert(`発行失敗: ${err.message}`);
    }
  };

  const handleDeleteEvent = async (id: string, title: string) => {
    if (!confirm(`イベント「${title} (${id})」とその全写真を完全に削除しますか？`)) return;

    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      alert('削除しました');
    } catch (err: any) {
      alert(`削除失敗: ${err.message}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto text-amber-400">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Wedding Snap Admin</h1>
            <p className="text-xs text-zinc-400 mt-1">サービス提供者マスター管理認証</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="管理者パスワード"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-2xl text-white text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-98 text-zinc-950 font-bold rounded-2xl shadow transition"
            >
              ダッシュボードに入る
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10 selection:bg-amber-500">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* ヘッダー */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
            <div>
              <h1 className="text-2xl font-black tracking-wider text-white">
                MASTER MANAGEMENT CONSOLE
              </h1>
              <p className="text-xs text-zinc-400">Wedding Snap サービス提供者管理画面</p>
            </div>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('master_admin_auth');
              setIsAuthenticated(false);
            }}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-xl text-zinc-300 self-start md:self-auto"
          >
            ログアウト
          </button>
        </header>

        {/* 新規イベント発行フォーム */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
          <h2 className="font-bold text-base text-zinc-200 flex items-center space-x-2">
            <Plus className="w-5 h-5 text-amber-400" />
            <span>新規結婚式イベントの発行</span>
          </h2>

          <form onSubmit={handleCreateEvent} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">
                イベントID (URLスラッグ) *
              </label>
              <input
                type="text"
                placeholder="例: sato-wedding-2026"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">
                挙式名 / タイトル *
              </label>
              <input
                type="text"
                placeholder="例: 佐藤・鈴木家 結婚披露宴"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">
                ホストPIN (4〜8桁) *
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="1234"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-bold text-sm rounded-xl shrink-0 transition"
                >
                  発行する
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* 発行済みイベント一覧 */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-base text-zinc-200">
              発行済みイベント ({events.length} 件)
            </h2>
            <button
              onClick={fetchEvents}
              className="text-xs text-amber-400 hover:underline"
            >
              最新の状態に更新
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-zinc-500">読み込み中...</div>
          ) : events.length === 0 ? (
            <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
              まだ発行されたイベントはありません
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-base text-white">{ev.title}</h3>
                      <button
                        onClick={() => handleDeleteEvent(ev.id, ev.title)}
                        className="text-zinc-500 hover:text-red-400 p-1 transition"
                        title="イベント削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-amber-400/90 font-mono mt-0.5">/{ev.id}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-zinc-950/60 rounded-xl p-3 text-xs text-zinc-400">
                    <div className="flex items-center space-x-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{ev.photo_count} 枚</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                      <span>PIN: {ev.host_pin}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{new Date(ev.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-1 border-t border-zinc-800/80">
                    <a
                      href={`/${ev.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>ゲスト/ホスト画面</span>
                    </a>

                    <a
                      href={`/${ev.id}/projector`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2 px-3 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-800/50 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                    >
                      <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                      <span>投影スクリーン</span>
                    </a>

                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/${ev.id}`;
                        navigator.clipboard.writeText(url);
                        alert(`招待URLをコピーしました:\n${url}`);
                      }}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition"
                      title="招待URLコピー"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

