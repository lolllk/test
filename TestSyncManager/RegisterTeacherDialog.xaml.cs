using System.Windows;

namespace TestSyncManager
{
    public partial class RegisterTeacherDialog : Window
    {
        public RegisterTeacherDialog()
        {
            InitializeComponent();
            EmailBox.Focus();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
            Close();
        }

        private void RegisterButton_Click(object sender, RoutedEventArgs e)
        {
            HideError();

            var email = EmailBox.Text.Trim();
            var name = NameBox.Text.Trim();
            var password = PasswordBox.Password;
            var confirmPassword = ConfirmPasswordBox.Password;

            if (string.IsNullOrEmpty(email))
            {
                ShowError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 Email");
                EmailBox.Focus();
                return;
            }

            if (string.IsNullOrEmpty(name))
            {
                ShowError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0424\u0418\u041E");
                NameBox.Focus();
                return;
            }

            if (string.IsNullOrEmpty(password))
            {
                ShowError("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C");
                PasswordBox.Focus();
                return;
            }

            if (password.Length < 6)
            {
                ShowError("\u041F\u0430\u0440\u043E\u043B\u044C \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u043D\u0435 \u043C\u0435\u043D\u0435\u0435 6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
                PasswordBox.Focus();
                return;
            }

            if (password != confirmPassword)
            {
                ShowError("\u041F\u0430\u0440\u043E\u043B\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442");
                ConfirmPasswordBox.Focus();
                return;
            }

            DialogResult = true;
            Close();
        }

        private void ShowError(string message)
        {
            ErrorText.Text = message;
            ErrorBorder.Visibility = Visibility.Visible;
        }

        private void HideError()
        {
            ErrorBorder.Visibility = Visibility.Collapsed;
        }
    }
}
