import React from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { resetPassword } from '../api/khApi';

export default function ResetPasswordScreen({ navigation }) {
  const [token, setToken] = React.useState('');
  const [pass, setPass] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function onSubmit() {
    if (!token.trim() || !pass) return;
    setLoading(true);
    try {
      await resetPassword(token.trim(), pass);
      Alert.alert('Listo', 'Password actualizado. Ya puedes iniciar sesion.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Restablecer password</Text>
      <Text style={styles.sub}>Pega el token del enlace y elige un password nuevo.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          placeholder="token"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Nuevo password</Text>
        <TextInput
          value={pass}
          onChangeText={setPass}
          secureTextEntry
          placeholder="password"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
        />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={onSubmit} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  sub: { color: theme.colors.muted, marginTop: 8, marginBottom: 14 },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 16 },
  label: { color: theme.colors.muted, marginTop: 10, marginBottom: 6 },
  input: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { marginTop: 14, backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#06120E', fontWeight: '800' },
});
