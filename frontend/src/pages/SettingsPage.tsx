import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, User, Lock, Bell, Palette, Save } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { useAuth } from '../app/context/AuthContext';
import { useTheme } from '../app/context/ThemeContext';
import { apiUrl } from '../lib/api';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { mode, accent, setMode, setAccent } = useTheme();
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [username, setUsername] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    pushNotifications: true,
    taskReminders: true,
    meetingReminders: true,
    newsDigest: false,
  });
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string; updated_at: string | null }>({
    connected: false,
    email: '',
    updated_at: null,
  });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

  const fetchGoogleStatus = async () => {
    setGoogleError('');
    try {
      const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
      const res = await fetch(`${apiUrl('/integrations/status')}${emailQuery}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to fetch integration status');
      setGoogleStatus(data.google || { connected: false, email: '', updated_at: null });
    } catch (err) {
      const error = err as Error;
      if (error.message === 'Failed to fetch') {
        setGoogleError('Cannot connect to server. Ensure your backend is running.');
      } else {
        setGoogleError(error.message || 'Failed to fetch integration status');
      }
    }
  };

  const fetchSettings = async () => {
    try {
      const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
      const res = await fetch(`${apiUrl('/settings')}${emailQuery}`);
      const data = await res.json();
      if (res.ok && data) {
        if (data.username) setUsername(data.username);
        if (data.notifications) setNotifications(data.notifications);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  useEffect(() => {
    fetchGoogleStatus();
    fetchSettings();
  }, [user?.email]);

  const handleGoogleConnect = async () => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
      const res = await fetch(`${apiUrl('/integrations/google/connect')}${emailQuery}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to start Google connect');
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Failed to connect Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      const res = await fetch(apiUrl('/integrations/google/disconnect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to disconnect Google');
      if (data?.ok) {
        setGoogleStatus({ connected: false, email: '', updated_at: new Date().toISOString() });
      }
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Failed to disconnect Google');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveChanges = async () => {
    try {
      const payload: Record<string, unknown> = { username, notifications };
      if (newPassword || currentPassword) {
        if (newPassword !== confirmPassword) {
          alert("New passwords do not match.");
          return;
        }
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
      const res = await fetch(`${apiUrl('/settings')}${emailQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        updateUser({ name: username });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        alert('Settings saved successfully!');
      } else {
        alert(`Failed to save settings: ${data.detail || data.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert('Failed to save settings. Please check your connection.');
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-primary-foreground shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <SettingsIcon className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Settings</h1>
        </div>
        <p className="text-lg text-white/90">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-card backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-border sticky top-6">
            <button onClick={() => scrollToSection('profile-section')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-primary text-primary-foreground">
              <User className="w-5 h-5" />
              <span>Profile</span>
            </button>
            <button onClick={() => scrollToSection('security-section')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-background transition-all mt-1">
              <Lock className="w-5 h-5" />
              <span>Security</span>
            </button>
            <button onClick={() => scrollToSection('notifications-section')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-background transition-all mt-1">
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
            </button>
            <button onClick={() => scrollToSection('appearance-section')} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-background transition-all mt-1">
              <Palette className="w-5 h-5" />
              <span>Appearance</span>
            </button>
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Section */}
          <div id="profile-section" className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
              <User className="w-6 h-6 text-primary" />
              Profile Settings
            </h2>

            {/* Profile Picture */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-3">
                Profile Picture
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden">
                  {profilePicture ? (
                    <img src={profilePicture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.charAt(0).toUpperCase() || 'A'
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="profile-picture"
                    accept="image/*"
                    onChange={handleProfilePictureChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="profile-picture"
                    className="px-4 py-2 rounded-xl bg-background text-foreground border border-border hover:bg-card cursor-pointer inline-block text-sm transition-all"
                  >
                    Change Picture
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">JPG, PNG or GIF. Max size 2MB</p>
                </div>
              </div>
            </div>

            {/* Username */}
            <div className="mb-6">
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-2">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 bg-background border-border text-foreground rounded-xl"
              />
            </div>

            {/* Email */}
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-background border-border text-foreground rounded-xl"
              />
            </div>
          </div>

          {/* Security Section */}
          <div id="security-section" className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
              <Lock className="w-6 h-6 text-primary" />
              Security Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-foreground mb-2">
                  Current Password
                </label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="h-12 bg-background border-border text-foreground rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-12 bg-background border-border text-foreground rounded-xl"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="h-12 bg-background border-border text-foreground rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div id="notifications-section" className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
              <Bell className="w-6 h-6 text-primary" />
              Notification Preferences
            </h2>

            <div className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 bg-background rounded-xl border border-border">
                  <div>
                    <p className="font-medium text-foreground">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {key === 'emailNotifications' && 'Receive notifications via email'}
                      {key === 'pushNotifications' && 'Receive push notifications on your device'}
                      {key === 'taskReminders' && 'Get reminders for upcoming tasks'}
                      {key === 'meetingReminders' && 'Get reminders for scheduled meetings'}
                      {key === 'newsDigest' && 'Receive daily news digest'}
                    </p>
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, [key]: checked })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Appearance Section */}
          <div id="appearance-section" className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
              <Palette className="w-6 h-6 text-primary" />
              Appearance
            </h2>

            <div className="p-4 bg-background rounded-xl border border-border space-y-6">
              {/* Mode Selection */}
              <div>
                <p className="font-medium text-foreground mb-3 text-sm">Mode</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setMode('light')} className={`py-3 px-4 rounded-xl border ${mode === 'light' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm`}>
                    Light Mode
                  </button>
                  <button onClick={() => setMode('dark')} className={`py-3 px-4 rounded-xl border ${mode === 'dark' ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm`}>
                    Dark Mode
                  </button>
                </div>
              </div>

              {/* Accent Color Selection */}
              <div>
                <p className="font-medium text-foreground mb-3 text-sm">Accent Color</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button onClick={() => setAccent('purple')} className={`py-3 px-4 rounded-xl border ${accent === 'purple' ? 'border-purple-500 bg-purple-500/10 text-purple-500 font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm flex items-center justify-center gap-2`}>
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div> Purple
                  </button>
                  <button onClick={() => setAccent('green')} className={`py-3 px-4 rounded-xl border ${accent === 'green' ? 'border-green-500 bg-green-500/10 text-green-500 font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm flex items-center justify-center gap-2`}>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div> Green
                  </button>
                  <button onClick={() => setAccent('pink')} className={`py-3 px-4 rounded-xl border ${accent === 'pink' ? 'border-pink-500 bg-pink-500/10 text-pink-500 font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm flex items-center justify-center gap-2`}>
                    <div className="w-3 h-3 rounded-full bg-pink-500"></div> Pink
                  </button>
                  <button onClick={() => setAccent('blue')} className={`py-3 px-4 rounded-xl border ${accent === 'blue' ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-semibold' : 'border-border hover:bg-card text-foreground'} transition-all text-sm flex items-center justify-center gap-2`}>
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div> Blue
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
            <h2 className="text-2xl font-bold mb-4 text-foreground">Google Integration</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Status: {googleStatus.connected ? `Connected (${googleStatus.email || 'Google account'})` : 'Not connected'}
            </p>
            {googleStatus.updated_at && (
              <p className="text-xs text-muted-foreground mb-4">Updated: {new Date(googleStatus.updated_at).toLocaleString()}</p>
            )}
            {googleError && <p className="text-sm text-red-400 mb-3">{googleError}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleGoogleConnect}
                disabled={googleLoading}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
              >
                Connect Google
              </button>
              <button
                onClick={handleGoogleDisconnect}
                disabled={googleLoading || !googleStatus.connected}
                className="px-4 py-2 rounded-xl bg-background text-foreground border border-border disabled:opacity-50"
              >
                Disconnect
              </button>
              <button
                onClick={fetchGoogleStatus}
                disabled={googleLoading}
                className="px-4 py-2 rounded-xl bg-background text-foreground border border-border"
              >
                Refresh Status
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveChanges}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
}
