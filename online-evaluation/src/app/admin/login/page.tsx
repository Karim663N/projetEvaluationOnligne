import LoginForm from '@/components/shell/LoginForm';

export default function AdminLogin() {
  return <LoginForm expectedRole="ADMIN" badge="Administration" title="Connexion administrateur" subtitle="Gérez les utilisateurs, les classes et les paramètres de la plateforme." />;
}
