import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { createOffer, createRequest } from '../api/khApi';
import { CATEGORIES, COMPENSATION_OPTIONS, WHEN_OPTIONS } from '../constants';

export default function CreateScreen({ navigation }) {
  const { token } = useAuth();
  const [kind, setKind] = React.useState('request');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('repairs');
  const [location, setLocation] = React.useState('');
  const [when, setWhen] = React.useState('asap');
  const [comp, setComp] = React.useState('cash');
  const [loading, setLoading] = React.useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setWhen('asap');
    setComp('cash');
    setCategory('repairs');
  };

  const submit = async () => {
    if (!token) return;
    if (!title.trim()) {
      Alert.alert('Falta titulo', 'Escribe un titulo.');
      return;
    }
    if (!category) {
      Alert.alert('Falta categoria', 'Elige una categoria.');
      return;
    }
    if (kind === 'request' && !location.trim()) {
      Alert.alert('Falta zona', 'Indica tu zona.');
      return;
    }
    setLoading(true);
    try {
      if (kind === 'request') {
        await createRequest(token, {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          location_text: location.trim(),
          when,
          compensation_type: comp,
          points_offered: 0,
        });
      } else {
        await createOffer(token, {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          location_text: location.trim() || undefined,
          compensation_type: comp,
          points_value: 0,
        });
      }
      reset();
      Alert.alert('Listo', 'Publicacion creada.');
      navigation.navigate('Creations');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo crear.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Crear</Text>
        <View style={styles.kindRow}>
          <Pressable style={[styles.kindBtn, kind === 'request' && styles.kindActive]} onPress={() => setKind('request')}>
            <Text style={[styles.kindText, kind === 'request' && styles.kindTextActive]}>Solicitud</Text>
          </Pressable>
          <Pressable style={[styles.kindBtn, kind === 'offer' && styles.kindActive]} onPress={() => setKind('offer')}>
            <Text style={[styles.kindText, kind === 'offer' && styles.kindTextActive]}>Oferta</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Titulo</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Ej: Ayuda con la compra" placeholderTextColor={theme.colors.muted} style={styles.input} />

        <Text style={styles.label}>Descripcion</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="Detalles" placeholderTextColor={theme.colors.muted} style={[styles.input, { height: 90 }]} multiline />

        <Text style={styles.label}>Categoria</Text>
        <View style={styles.chips}>
          {CATEGORIES.map(c => (
            <Pressable key={c.id} style={[styles.chip, category === c.id && styles.chipActive]} onPress={() => setCategory(c.id)}>
              <Text style={[styles.chipText, category === c.id && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Zona</Text>
        <TextInput value={location} onChangeText={setLocation} placeholder="Barrio, ciudad" placeholderTextColor={theme.colors.muted} style={styles.input} />

        {kind === 'request' ? (
          <>
            <Text style={styles.label}>Cuando</Text>
            <View style={styles.chips}>
              {WHEN_OPTIONS.map(w => (
                <Pressable key={w.id} style={[styles.chip, when === w.id && styles.chipActive]} onPress={() => setWhen(w.id)}>
                  <Text style={[styles.chipText, when === w.id && styles.chipTextActive]}>{w.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Compensacion</Text>
        <View style={styles.chips}>
          {COMPENSATION_OPTIONS.map(c => (
            <Pressable key={c.id} style={[styles.chip, comp === c.id && styles.chipActive]} onPress={() => setComp(c.id)}>
              <Text style={[styles.chipText, comp === c.id && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.btn, styles.btnPrimary, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
          <Text style={styles.btnPrimaryText}>{loading ? 'Publicando...' : 'Publicar'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  label: { color: theme.colors.muted, marginTop: 12, marginBottom: 6 },
  input: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  chipText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: theme.colors.text },
  btn: { borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginTop: 16 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kindBtn: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 10 },
  kindActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  kindText: { color: theme.colors.muted, textAlign: 'center', fontWeight: '700' },
  kindTextActive: { color: theme.colors.text },
});
