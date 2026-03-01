//go:build darwin && arm64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/darwin_arm64 -ltalon
#cgo LDFLAGS: -framework Security -framework CoreFoundation -liconv
*/
import "C"
