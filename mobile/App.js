import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from './src/screens/LoginScreen';
import MatchesScreen from './src/screens/MatchesScreen';
import ChatScreen from './src/screens/ChatScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import MatchDetailScreen from './src/screens/MatchDetailScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import AutoMatchScreen from './src/screens/AutoMatchScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import CreateScreen from './src/screens/CreateScreen';
import CreationsScreen from './src/screens/CreationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PremiumScreen from './src/screens/PremiumScreen';
import RankingScreen from './src/screens/RankingScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import FeedDetailScreen from './src/screens/FeedDetailScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import { AuthProvider, useAuth } from './src/state/auth';
import { theme } from './src/ui/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.colors.bg, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tab.Screen name="Explorar" component={ExploreScreen} />
      <Tab.Screen name="Crear" component={CreateScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="AutoMatch" component={AutoMatchScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNav() {
  const { token, booted } = useAuth();

  if (!booted) return null;

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {token ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Match" component={MatchDetailScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Creations" component={CreationsScreen} options={{ title: 'Creaciones' }} />
          <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: 'Premium' }} />
          <Stack.Screen name="Ranking" component={RankingScreen} options={{ title: 'Ranking' }} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Favoritos' }} />
          <Stack.Screen name="FeedDetail" component={FeedDetailScreen} options={{ title: 'Detalle' }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Registro' }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Recuperar' }} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Restablecer' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.bg,
      card: theme.colors.bg,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.brand,
    },
  };

  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <AppNav />
      </NavigationContainer>
      <StatusBar style="light" />
    </AuthProvider>
  );
}
