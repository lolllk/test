using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace TestSyncManager.ViewModels
{
    /// <summary>
    /// Base class providing INotifyPropertyChanged for all ViewModels.
    /// </summary>
    public abstract class BaseViewModel : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler? PropertyChanged;

        protected void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
