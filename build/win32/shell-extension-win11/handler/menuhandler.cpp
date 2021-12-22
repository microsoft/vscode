// menuhandler.cpp : Defines the entry point for the context menu DLL handler.

// This code is aggressively copied from
// https://github.com/microsoft/AppModelSamples/Samples/SparsePackages/PhotoStoreContextMenu/dllmain.cpp

#define WIN32_LEAN_AND_MEAN // Exclude rarely-used stuff from Windows headers
#include <windows.h>
#include <shlwapi.h>
#include <shobjidl_core.h>
#include <wrl/client.h>
#include <wrl/implements.h>
#include <wrl/module.h>
#include "wil\resource.h"
#include <sstream>
#include <string>
#include <vector>

using namespace Microsoft::WRL;

BOOL APIENTRY DllMain(HMODULE hModule,
    DWORD ul_reason_for_call,
    LPVOID lpReserved)
{
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
    case DLL_PROCESS_DETACH:
        break;
    }
    return TRUE;
}

class ExplorerCommandBase : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand, IObjectWithSite> {
public:
    virtual const wchar_t* Title() = 0;
    virtual const EXPCMDFLAGS Flags() { return ECF_DEFAULT; }
    virtual const EXPCMDSTATE State(_In_opt_ IShellItemArray* selection) { return ECS_ENABLED; }

    // IExplorerCommand
    IFACEMETHODIMP GetTitle(_In_opt_ IShellItemArray* items, _Outptr_result_nullonfailure_ PWSTR* name)
    {
        *name = nullptr;
        auto title = wil::make_cotaskmem_string_nothrow(Title());
        RETURN_IF_NULL_ALLOC(title);
        *name = title.release();
        return S_OK;
    }
    IFACEMETHODIMP GetIcon(_In_opt_ IShellItemArray*, _Outptr_result_nullonfailure_ PWSTR* icon)
    {
        wchar_t str_data[1028];
        DWORD size = sizeof(str_data);
        RETURN_IF_FAILED(RegGetValue(
            HKEY_CLASSES_ROOT, L"@@ROOT_KEY@@", L"Icon",
            RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND, NULL, str_data, &size
		));
        return SHStrDup(str_data, icon);
    }
    IFACEMETHODIMP GetToolTip(_In_opt_ IShellItemArray*, _Outptr_result_nullonfailure_ PWSTR* infoTip)
    {
        *infoTip = nullptr;
        return E_NOTIMPL;
    }
    IFACEMETHODIMP GetCanonicalName(_Out_ GUID* guidCommandName)
    {
        *guidCommandName = GUID_NULL;
        return S_OK;
    }
    IFACEMETHODIMP GetState(_In_opt_ IShellItemArray* selection, _In_ BOOL okToBeSlow, _Out_ EXPCMDSTATE* cmdState)
    {
        *cmdState = State(selection);
        return S_OK;
    }
    IFACEMETHODIMP Invoke(_In_opt_ IShellItemArray* selection, _In_opt_ IBindCtx*) noexcept
    try {
        HWND parent = nullptr;
        if (m_site) {
            ComPtr<IOleWindow> oleWindow;
            RETURN_IF_FAILED(m_site.As(&oleWindow));
            RETURN_IF_FAILED(oleWindow->GetWindow(&parent));
        }

        if (selection) {
            DWORD count;
            RETURN_IF_FAILED(selection->GetCount(&count));

            IShellItem* psi;
            LPWSTR itemName;

			wchar_t cmdline_buf[1028];
			DWORD size = sizeof(cmdline_buf);
			RETURN_IF_FAILED(RegGetValue(
				HKEY_CLASSES_ROOT, L"@@ROOT_KEY@@\\command", L"",
				RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND, NULL, cmdline_buf, &size
			));
			

            for (DWORD i = 0; i < count; ++i) {
                selection->GetItemAt(i, &psi);
                RETURN_IF_FAILED(psi->GetDisplayName(SIGDN_FILESYSPATH, &itemName));

				std::wstring cmdline{ cmdline_buf };
				cmdline = cmdline.replace(cmdline.find(L"%1"), 2, itemName);

                STARTUPINFO si = {};
                PROCESS_INFORMATION pi = {};

                CreateProcess(
                    nullptr, (LPWSTR)cmdline.c_str(),
                    nullptr, nullptr, false, 0, nullptr, nullptr, &si, &pi);
            }
        }

        return S_OK;
    }
    CATCH_RETURN();

    IFACEMETHODIMP GetFlags(_Out_ EXPCMDFLAGS* flags)
    {
        *flags = Flags();
        return S_OK;
    }
    IFACEMETHODIMP EnumSubCommands(_COM_Outptr_ IEnumExplorerCommand** enumCommands)
    {
        *enumCommands = nullptr;
        return E_NOTIMPL;
    }

    // IObjectWithSite
    IFACEMETHODIMP SetSite(_In_ IUnknown* site) noexcept
    {
        m_site = site;
        return S_OK;
    }
    IFACEMETHODIMP GetSite(_In_ REFIID riid, _COM_Outptr_ void** site) noexcept { return m_site.CopyTo(riid, site); }

protected:
    ComPtr<IUnknown> m_site;
};

class __declspec(uuid("BF6EE3D9-EC02-4489-AD75-ACDED99BAB44")) ExplorerCommandHandler final : public ExplorerCommandBase {
public:
    const wchar_t* Title() override { return L"Open with Code"; }
};

CoCreatableClass(ExplorerCommandHandler)
CoCreatableClassWrlCreatorMapInclude(ExplorerCommandHandler)

STDAPI DllGetActivationFactory(_In_ HSTRING activatableClassId, _COM_Outptr_ IActivationFactory** factory)
{
    return Module<ModuleType::InProc>::GetModule().GetActivationFactory(activatableClassId, factory);
}

STDAPI DllCanUnloadNow()
{
    return Module<InProc>::GetModule().GetObjectCount() == 0 ? S_OK : S_FALSE;
}

STDAPI DllGetClassObject(_In_ REFCLSID rclsid, _In_ REFIID riid, _COM_Outptr_ void** instance)
{
    return Module<InProc>::GetModule().GetClassObject(rclsid, riid, instance);
}