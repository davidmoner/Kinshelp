import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { login } from '../api/khApi';
import { useAuth } from '../state/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState('demo.alice@kingshelp.local');
  const [password, setPassword] = React.useState('password123');
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

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>KingsHelp</Text>
        <Text style={styles.title}>Inicia sesion</Text>
        <Text style={styles.sub}>Primero: inbox + chat + notificaciones.</Text>
      </View>

      <View style={styles.card}>
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
  hint: { color: theme.colors.muted, marginTop: 14, fontSize: 12 },
});
