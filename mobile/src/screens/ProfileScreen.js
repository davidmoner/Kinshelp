import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { listBadgesMine, getMyPoints, me, requestVerifyEmail, updateMe } from '../api/khApi';

export default function ProfileScreen({ navigation }) {
  const { token, signOut } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const [points, setPoints] = React.useState(null);
  const [badges, setBadges] = React.useState([]);
  const [name, setName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [location, setLocation] = React.useState('');

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const u = await me(token);
      setUser(u);
      setName(u.display_name || '');
      setBio(u.bio || '');
      setLocation(u.location_text || '');
      const p = await getMyPoints(token);
      setPoints(p && p.balance ? p.balance : 0);
      const b = await listBadgesMine(token);
      setBadges((b && b.data) || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await updateMe(token, {
        display_name: name.trim() || undefined,
        bio: bio.trim() || null,
        location_text: location.trim() || null,
      });
      await load();
    } catch (e) {
      Alert.alert('Perfil', e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    try {
      const out = await requestVerifyEmail(token);
      if (out && out.email_sent) Alert.alert('Verificacion', 'Te enviamos un email.');
      else Alert.alert('Verificacion', 'No se pudo enviar.');
    } catch (e) {
      Alert.alert('Verificacion', e.message || 'No se pudo enviar.');
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.meta}>Reputacion: {points || 0}</Text>
        {user && user.email ? <Text style={styles.meta}>Email: {user.email}</Text> : null}

        <Text style={styles.label}>Nombre</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} />

        <Text style={styles.label}>Zona</Text>
        <TextInput value={location} onChangeText={setLocation} style={styles.input} />

        <Text style={styles.label}>Bio</Text>
        <TextInput value={bio} onChangeText={setBio} style={[styles.input, { height: 90 }]} multiline />

        <Pressable style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          <Text style={styles.btnPrimaryText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>

        {user && (user.is_verified === false || user.is_verified === 0) ? (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={verify}>
            <Text style={styles.btnGhostText}>Enviar verificacion</Text>
          </Pressable>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badges</Text>
          {!badges.length ? (
            <Text style={styles.meta}>Aun no tienes badges.</Text>
          ) : (
            badges.map(b => (
              <View key={b.id} style={styles.badgeRow}>
                <Text style={styles.badgeTitle}>{b.name}</Text>
                <Text style={styles.badgeDesc}>{b.description}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Atajos</Text>
          <View style={styles.quickRow}>
            <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Favorites')}>
              <Text style={styles.quickText}>Favoritos</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Creations')}>
              <Text style={styles.quickText}>Creaciones</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Premium')}>
              <Text style={styles.quickText}>Premium</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Ranking')}>
              <Text style={styles.quickText}>Ranking</Text>
            </Pressable>
            <Pressable style={styles.quickBtn} onPress={() => navigation.navigate('Notifications')}>
              <Text style={styles.quickText}>Notificaciones</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.btn, styles.btnGhost]} onPress={signOut}>
          <Text style={styles.btnGhostText}>Cerrar sesion</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  meta: { color: theme.colors.muted, marginBottom: 8 },
  label: { color: theme.colors.muted, marginTop: 12, marginBottom: 6 },
  input: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.card },
  btn: { borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 12 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  section: { marginTop: 16 },
  sectionTitle: { color: theme.colors.text, fontWeight: '800', marginBottom: 8 },
  badgeRow: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 10, marginBottom: 8, backgroundColor: theme.colors.card },
  badgeTitle: { color: theme.colors.text, fontWeight: '800' },
  badgeDesc: { color: theme.colors.muted, marginTop: 4 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  quickText: { color: theme.colors.text, fontWeight: '700', fontSize: 12 },
});
