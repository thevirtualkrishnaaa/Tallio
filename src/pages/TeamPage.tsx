import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLES, roleLabel, can } from '../lib/roles';
import type { OrgRole, OrgMember, Invite } from '../types';

const TeamPage: React.FC = () => {
  const {
    org, user, role, isDemo,
    listMembers, listInvites, inviteMember, cancelInvite, updateMemberRole, removeMember,
  } = useAuth();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('cashier');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const isOwner = can.manageTeam(role);

  const refresh = async () => {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([listMembers(), listInvites()]);
      setMembers(m.sort((a) => (a.role === 'owner' ? -1 : 1)));
      // Hide invites that have already been accepted (now a member)
      const memberEmails = new Set(m.map((x) => x.email?.toLowerCase()));
      setInvites(i.filter((inv) => !memberEmails.has(inv.email.toLowerCase())));
    } catch (e: any) {
      setError(e.message || 'Could not load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) refresh();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  if (!org) return null;

  if (!isOwner) {
    return (
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">Team</h2>
        <p className="text-sm text-gray-500 mb-6">Your role: {roleLabel(role)}</p>
        <div className="bg-white border rounded-xl p-8 text-center text-sm text-gray-400">
          Only the owner can manage team members.
        </div>
      </div>
    );
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMsg('');
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    if (isDemo) { setError('Inviting teammates is disabled in demo mode.'); return; }
    if (members.some((m) => m.email?.toLowerCase() === clean)) { setError('That person is already a member.'); return; }
    setBusy(true);
    try {
      await inviteMember(clean, inviteRole);
      setMsg(`Invite sent to ${clean}. They'll join as ${roleLabel(inviteRole)} when they sign in with this email.`);
      setEmail('');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Could not send invite');
    } finally {
      setBusy(false);
    }
  };

  const onRoleChange = async (m: OrgMember, newRole: OrgRole) => {
    if (m.userId === org.ownerId) return;
    await updateMemberRole(m.id || m.userId, newRole);
    await refresh();
  };

  const onRemove = async (m: OrgMember) => {
    if (!window.confirm(`Remove ${m.email} from the team?`)) return;
    try {
      await removeMember(m.id || m.userId);
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Could not remove member');
    }
  };

  const onCancelInvite = async (inv: Invite) => {
    await cancelInvite(inv.email);
    await refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="text-gray-700" size={22} />
        <h2 className="text-2xl font-semibold text-gray-900">Team</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">Invite staff and control what they can access.</p>

      {/* Invite form */}
      <div className="bg-white border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-1.5">
          <UserPlus size={16} /> Invite a teammate
        </h3>
        <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as OrgRole)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {ROLES.filter((r) => r.id !== 'owner').map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          {ROLES.find((r) => r.id === inviteRole)?.blurb}
        </p>
        {msg && <p className="text-sm text-green-600 mt-2">{msg}</p>}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {/* Members */}
      <div className="bg-white border rounded-xl p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Members</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {members.map((m) => {
                const owner = m.userId === org.ownerId;
                const isMe = m.userId === user?.uid;
                return (
                  <tr key={m.id || m.userId} className="border-b last:border-0">
                    <td className="py-2.5">
                      <div className="font-medium text-gray-900">
                        {m.email} {isMe && <span className="text-gray-400 font-normal">(you)</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      {owner ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-white">Owner</span>
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) => onRoleChange(m, e.target.value as OrgRole)}
                          className="border rounded-lg px-2 py-1 text-xs"
                        >
                          {ROLES.filter((r) => r.id !== 'owner').map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-2.5 text-right w-10">
                      {!owner && (
                        <button onClick={() => onRemove(m)} className="text-gray-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Pending invites</h3>
          <table className="w-full text-sm">
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.email} className="border-b last:border-0">
                  <td className="py-2.5 flex items-center gap-2 text-gray-700">
                    <Mail size={14} className="text-gray-400" /> {inv.email}
                  </td>
                  <td className="py-2.5 text-right text-gray-500">{roleLabel(inv.role)}</td>
                  <td className="py-2.5 text-right w-10">
                    <button onClick={() => onCancelInvite(inv)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeamPage;
