'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getContactList, deleteContact, markContactAsRead, Contact } from '@/lib/firebase/contact';

export default function AdminContactsPage() {
  const { user, loading: authLoading } = useAuth();
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/admin/login';
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const contacts = await getContactList();
      setContactList(contacts);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('本当にこのお問い合わせを削除しますか？')) {
      try {
        await deleteContact(id);
        fetchContacts();
        if (selectedContact?.id === id) {
          setSelectedContact(null);
        }
      } catch (error) {
        console.error('Failed to delete contact:', error);
        alert('削除に失敗しました');
      }
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await markContactAsRead(id);
      fetchContacts();
      if (selectedContact?.id === id) {
        setSelectedContact({ ...selectedContact, read: true });
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
      alert('既読に失敗しました');
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const unreadCount = contactList.filter((c) => !c.read).length;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* ヘッダー */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              お問合せ一覧
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-600">
                未読: <span className="font-semibold text-primary">{unreadCount}件</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* お問い合わせリスト */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-semibold text-gray-900">お問い合わせ一覧</h2>
                </div>
                <div className="divide-y divide-gray-200 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {contactList.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      お問い合わせはありません
                    </div>
                  ) : (
                    contactList.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => setSelectedContact(contact)}
                        className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                          selectedContact?.id === contact.id ? 'bg-primary/5' : ''
                        } ${!contact.read ? 'border-l-4 border-primary' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {contact.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {contact.email}
                            </p>
                          </div>
                          {!contact.read && (
                            <span className="ml-2 flex-shrink-0 w-2 h-2 bg-primary rounded-full"></span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(contact.createdAt)}
                        </p>
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                          {contact.message}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* お問い合わせ詳細 */}
            <div className="lg:col-span-2">
              {selectedContact ? (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-2">
                        お問い合わせ詳細
                      </h2>
                      {!selectedContact.read && (
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded">
                          未読
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!selectedContact.read && (
                        <button
                          onClick={() => handleMarkAsRead(selectedContact.id)}
                          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                        >
                          既読にする
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(selectedContact.id)}
                        className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">お名前</label>
                      <p className="mt-1 text-base text-gray-900">{selectedContact.name}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">メールアドレス</label>
                      <p className="mt-1 text-base text-gray-900">
                        <a
                          href={`mailto:${selectedContact.email}`}
                          className="text-primary hover:underline"
                        >
                          {selectedContact.email}
                        </a>
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">会社名</label>
                      <p className="mt-1 text-base text-gray-900">{selectedContact.company}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">お問い合わせ日時</label>
                      <p className="mt-1 text-base text-gray-900">
                        {formatDate(selectedContact.createdAt)}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">お問い合わせ内容</label>
                      <div className="mt-1 p-4 bg-gray-50 rounded-lg">
                        <p className="text-base text-gray-900 whitespace-pre-wrap">
                          {selectedContact.message}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <p className="text-gray-500">左側のリストからお問い合わせを選択してください</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

