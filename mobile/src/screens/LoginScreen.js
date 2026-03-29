import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { login } from '../api/khApi';
import { useAuth } from '../state/auth';
import { signInWithGoogle, signInWithFacebook } from '../auth/oauth';

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function onSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      const out = await login(email.trim(), password);
      await signIn(out.token);
    } catch (e) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    try {
      const out = await signInWithGoogle();
      if (out && out.token) await signIn(out.token);
      else if (out && out.message) Alert.alert('Google', out.message);
    } catch (e) {
      Alert.alert('Google', e.message);
    }
  }

  async function onFacebook() {
    try {
      const out = await signInWithFacebook();
      if (out && out.token) await signIn(out.token);
      else if (out && out.message) Alert.alert('Facebook', out.message);
    } catch (e) {
      Alert.alert('Facebook', e.message);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>KingsHelp</Text>
        <Text style={styles.title}>Inicia sesion</Text>
        <Text style={styles.sub}>Primero: inbox + chat + notificaciones.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.socialRow}>
          <TouchableOpacity style={[styles.socialBtn, { borderColor: 'rgba(255,255,255,0.16)' }]} onPress={onGoogle}>
            <View style={styles.socialInner}>
              <View style={[styles.socialIconBox, { backgroundColor: '#fff' }]}>
                <Text style={styles.socialG}>G</Text>
              </View>
              <Text style={styles.socialText}>Continuar con Google</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialBtn, { borderColor: 'rgba(255,255,255,0.16)' }]} onPress={onFacebook}>
            <View style={styles.socialInner}>
              <View style={[styles.socialIconBox, { backgroundColor: '#1877F2' }]}>
                <Text style={styles.socialIconText}>f</Text>
              </View>
              <Text style={styles.socialText}>Continuar con Facebook</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>o</Text>
          <View style={styles.line} />
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tu@email.com"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="password"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.linkText}>Olvidaste tu password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>Crear cuenta</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Si estas en Android emulator: `BASE_URL` usa 10.0.2.2</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 10, marginBottom: 18 },
  kicker: { color: theme.colors.brand, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '700', marginTop: 6 },
  sub: { color: theme.colors.muted, marginTop: 8 },
  card: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  socialRow: { gap: 10 },
  socialBtn: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  socialInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  socialIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIcon: { width: 16, height: 16 },
  socialG: { color: '#111827', fontWeight: '900' },
  socialIconText: { color: '#fff', fontWeight: '900', fontSize: 16, marginTop: -2 },
  socialText: { color: theme.colors.text, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  or: { color: theme.colors.muted, fontSize: 12 },
  label: { color: theme.colors.muted, marginTop: 10, marginBottom: 6 },
  input: {
    color: theme.colors.text,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    marginTop: 14,
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#06120E', fontWeight: '800' },
  linkBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  linkText: { color: theme.colors.brand, fontWeight: '800' },
  hint: { color: theme.colors.muted, marginTop: 14, fontSize: 12 },
});
