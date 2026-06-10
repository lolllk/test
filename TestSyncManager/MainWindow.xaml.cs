using System.Windows;
using TestSyncManager.ViewModels;

namespace TestSyncManager
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            base.OnClosing(e);
            if (DataContext is MainViewModel vm)
                vm.Shutdown();
        }
    }
}
