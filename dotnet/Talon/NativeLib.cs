// Talon .NET SDK — P/Invoke 原生绑定。

using System;
using System.Runtime.InteropServices;

namespace TalonDb
{
    /// <summary>C ABI 原生函数绑定。</summary>
    internal static class NativeLib
    {
        private const string LibName = "talon";

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr talon_open(
            [MarshalAs(UnmanagedType.LPUTF8Str)] string path);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern void talon_close(IntPtr handle);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int talon_execute(
            IntPtr handle,
            [MarshalAs(UnmanagedType.LPUTF8Str)] string cmdJson,
            out IntPtr outJson);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern void talon_free_string(IntPtr ptr);

        [DllImport(LibName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int talon_persist(IntPtr handle);
    }
}
